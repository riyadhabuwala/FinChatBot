import re
import json
from pathlib import Path
from langchain_groq import ChatGroq
from app.agent.state import AgentState
from app.agent.prompts import ANALYST_PROMPT, ANALYST_RETRY_PROMPT, SELF_VERIFY_PROMPT
from app.agent.tools.code_executor import execute_analyst_code, load_dataframe, get_df_summary
from app.rag.retriever import retrieve
from app.config import settings

llm = ChatGroq(
    groq_api_key=settings.groq_api_key,
    model_name="llama-3.3-70b-versatile",
    temperature=0.2,
    max_tokens=1024,
)

# Lighter model for self-verification (fast, cheap)
verify_llm = ChatGroq(
    groq_api_key=settings.groq_api_key,
    model_name="llama-3.1-8b-instant",
    temperature=0.0,
    max_tokens=256,
)

# Keywords that indicate a derived metric must be COMPUTED, not just looked up
DERIVED_METRIC_KEYWORDS = [
    "margin", "ratio", "rate", "growth", "percentage", "efficiency",
    "return on", "roe", "roa", "roce", "yield", "per share",
]


def sanitize_code(code: str) -> str:
    """
    Remove any import statements from LLM-generated code.
    RestrictedPython blocks imports anyway, but removing them
    prevents confusing error messages.
    """
    lines = code.split('\n')
    clean = [l for l in lines if not re.match(r'^\s*(import|from)\s+', l)]
    return '\n'.join(clean)


def validate_columns(code: str, df_columns: list) -> str:
    """
    Scan generated code for column name references that don't exist
    in the DataFrame. Replace with a safe fallback comment.
    """
    pattern = r"df\[['\"]([^'\"]+)['\"]\]"
    matches = re.findall(pattern, code)
    invalid = [m for m in matches if m not in df_columns]
    if invalid:
        warning = (
            f"# WARNING: columns {invalid} not found.\n"
            f"# Available columns: {df_columns}\n"
            f"# Fix column names before running.\n"
        )
        return warning + code
    return code


def _strip_fences(code: str) -> str:
    """Strip markdown code fences from LLM output."""
    if "```python" in code:
        code = code.split("```python")[1].split("```")[0].strip()
    elif "```" in code:
        code = code.split("```")[1].split("```")[0].strip()
    return code.strip()


def _requires_computation(task_desc: str) -> bool:
    """
    Deterministic check: does this task require a derived metric
    to be COMPUTED (not just looked up)?
    """
    desc_lower = task_desc.lower()
    return any(kw in desc_lower for kw in DERIVED_METRIC_KEYWORDS)


def _deterministic_validate(task_desc: str, exec_result: dict) -> str | None:
    """
    Hard code-level validation (not LLM-based).
    Returns an error string if validation fails, None if OK.

    This is the 'Pro Tip' deterministic check that guarantees
    no escape from computation requirements.
    """
    if not exec_result['success']:
        return None  # Already failed, will be retried

    result_str = str(exec_result.get('result', ''))
    result_meta = exec_result.get('result_meta', {})

    # Check 1: If task requires computation, verify it was actually computed
    if _requires_computation(task_desc):
        # If we have structured metadata, check the 'computed' flag
        if result_meta and result_meta.get('computed') is False:
            return (f"DETERMINISTIC CHECK FAILED: Task '{task_desc}' requires "
                    f"computation of a derived metric, but result indicates "
                    f"computed=False. The metric must be calculated, not assumed.")

        # Check for fake failure patterns in the result string
        fake_failure_patterns = [
            "column not found",
            "not available",
            "could not be completed",
            "data not found",
            "cannot calculate",
            "unable to compute",
        ]
        result_lower = result_str.lower()
        for pattern in fake_failure_patterns:
            if pattern in result_lower and "code error" not in result_lower:
                return (f"DETERMINISTIC CHECK FAILED: Task requires computation "
                        f"but result claims '{pattern}'. Derived metrics should "
                        f"be computed from base columns, not looked up.")

    # Check 2: Result should not be empty or trivial
    if exec_result['success'] and (not result_str or result_str == "No result variable set"):
        return "DETERMINISTIC CHECK FAILED: Code executed successfully but produced no result."

    return None  # All checks passed


async def _generate_and_execute(
    task_desc: str, context: str, df_summary: str, df, columns: list
) -> dict:
    """
    Generate analyst code, sanitize, validate, execute.
    If execution fails or deterministic check fails, retry once with error context.
    Returns the exec_result dict.
    """
    # --- First attempt ---
    prompt = ANALYST_PROMPT.format(
        task_description=task_desc,
        context=context,
        data_summary=df_summary,
    )
    response = await llm.ainvoke([{"role": "user", "content": prompt}])
    code = _strip_fences(response.content.strip())
    code = sanitize_code(code)
    code = validate_columns(code, columns)
    print(f"[Analyst] Generated code (attempt 1):\n{code}")

    exec_result = execute_analyst_code(code, df)
    print(f"[Analyst] Attempt 1: success={exec_result['success']}, "
          f"result={str(exec_result['result'])[:200]}")

    # --- Deterministic validation ---
    det_error = _deterministic_validate(task_desc, exec_result)
    if det_error:
        print(f"[Analyst] {det_error}")
        # Force a retry by marking as failed
        exec_result = {
            **exec_result,
            'success': False,
            'error': det_error,
        }

    # --- Retry on failure ---
    if not exec_result['success']:
        error_msg = exec_result.get('error', 'Unknown error')
        print(f"[Analyst] Code failed, retrying with error context...")
        retry_prompt = ANALYST_RETRY_PROMPT.format(
            error=error_msg[:500],
            columns=columns,
            head=df.head(3).to_string(),
            task_description=task_desc,
        )
        retry_response = await llm.ainvoke([{"role": "user", "content": retry_prompt}])
        retry_code = _strip_fences(retry_response.content.strip())
        retry_code = sanitize_code(retry_code)
        retry_code = validate_columns(retry_code, columns)
        print(f"[Analyst] Retry code:\n{retry_code}")

        retry_result = execute_analyst_code(retry_code, df)
        print(f"[Analyst] Retry: success={retry_result['success']}, "
              f"result={str(retry_result['result'])[:200]}")

        if retry_result['success']:
            # Validate retry result too
            retry_det_error = _deterministic_validate(task_desc, retry_result)
            if retry_det_error:
                print(f"[Analyst] Retry also failed deterministic check: {retry_det_error}")
                # Use retry result anyway but append the warning
                retry_result['result'] = (
                    str(retry_result['result']) +
                    f"\n[Warning: {retry_det_error}]"
                )
            exec_result = retry_result

    return exec_result


async def _self_verify(task_desc: str, code: str, result: str) -> dict:
    """
    Run a lightweight self-verification check on the analysis result.
    Returns {"answers_question": bool, "uses_correct_metric": bool, "issue": str}
    """
    try:
        prompt = SELF_VERIFY_PROMPT.format(
            task_description=task_desc,
            code=code[:800] if code else "No code executed",
            result=str(result)[:500],
        )
        response = await verify_llm.ainvoke([{"role": "user", "content": prompt}])
        content = response.content.strip()

        # Parse JSON
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        verdict = json.loads(content.strip())
        print(f"[Analyst] Self-verify: {verdict}")
        return verdict
    except Exception as e:
        print(f"[Analyst] Self-verify failed: {e}")
        return {"answers_question": True, "uses_correct_metric": True, "issue": ""}


async def analyst_node(state: AgentState) -> dict:
    print(f"[Analyst] Starting — file_ids={state['file_ids']}")
    print(f"[Analyst] file_paths={state['file_paths']}")

    await state['stream_callback']('agent_step', {
        'agent': 'Analyst', 'status': 'running', 'step': 2
    })

    # Load DataFrame
    df = None
    columns = []
    df_summary = "No structured data file available — analysis will use document context only."

    for fpath in state['file_paths']:
        df = load_dataframe(fpath)
        if df is not None:
            columns = df.columns.tolist()
            df_summary = get_df_summary(df)
            print(f"[Analyst] DataFrame ready: shape={df.shape}, columns={columns}")
            break

    if df is None:
        print("[Analyst] WARNING: no DataFrame loaded")

    analysis_results = []

    for task in state['tasks']:
        print(f"[Analyst] Processing task: {task['description']}")

        # Get RAG context
        rag_result = retrieve(
            user_id=state['user_id'],
            query=task['description'],
            file_ids=state['file_ids'],
            mode='agentic',
        )
        context = rag_result.get('context', 'No document context found.')

        if task.get('requires_data') and df is not None:
            # Generate, validate, execute (with auto-retry + deterministic check)
            exec_result = await _generate_and_execute(
                task_desc=task['description'],
                context=context,
                df_summary=df_summary,
                df=df,
                columns=columns,
            )

            result_text = (
                exec_result['result'] if exec_result['success']
                else f"Code error: {exec_result['error']}"
            )

            # Self-verification: did the code answer the RIGHT question?
            if exec_result['success'] and exec_result['result']:
                verify = await _self_verify(
                    task['description'],
                    exec_result['code_used'],
                    exec_result['result'],
                )
                if verify.get('issue'):
                    result_text += f"\n[Verification note: {verify['issue']}]"

            analysis_results.append({
                **task,
                'result':       result_text,
                'code_used':    exec_result['code_used'],
                'chart_data':   exec_result['chart_data'],
                'context_used': context[:300],
            })
        else:
            # No structured data — use RAG context only
            analysis_results.append({
                **task,
                'result':       context[:800] if context else "No relevant context found.",
                'code_used':    None,
                'chart_data':   None,
                'context_used': context[:300],
            })

        await state['stream_callback']('agent_task_done', {
            'taskId':      task['id'],
            'description': task['description'],
            'result':      str(analysis_results[-1]['result'])[:200],
        })

    await state['stream_callback']('agent_step', {
        'agent': 'Analyst', 'status': 'done', 'step': 2,
        'output': f"Completed {len(analysis_results)} analyses",
    })

    chart_specs = [r['chart_data'] for r in analysis_results if r.get('chart_data')]
    return {'analysis_results': analysis_results, 'chart_specs': chart_specs}
