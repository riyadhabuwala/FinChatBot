import json
from pathlib import Path
from langchain_groq import ChatGroq
from app.agent.state import AgentState
from app.agent.prompts import PLANNER_PROMPT
from app.analysis.stats import compute_financial_stats
from app.config import settings

llm = ChatGroq(
    groq_api_key=settings.groq_api_key,
    model_name="llama-3.3-70b-versatile",
    temperature=0.3,
    max_tokens=1024,
)


async def planner_node(state: AgentState) -> dict:
    await state['stream_callback']('agent_step', {
        'agent': 'Planner', 'status': 'running', 'step': 1
    })

    # Get stats
    structured_paths = [p for p in state['file_paths']
                        if p.endswith(('.csv', '.xlsx', '.xls'))]
    stats = compute_financial_stats(structured_paths) if structured_paths else {}
    data_summary = json.dumps(stats, indent=2) if stats else "No structured data."

    # Also get actual column names for the prompt
    column_info = ""
    for fpath in state['file_paths']:
        from app.agent.tools.code_executor import load_dataframe, get_df_summary
        df = load_dataframe(fpath)
        if df is not None:
            fname = Path(fpath).name
            column_info = (
                f"\nActual file loaded: {fname}"
                f"\nExact columns available: {df.columns.tolist()}"
                f"\nShape: {df.shape[0]} rows x {df.shape[1]} columns"
                f"\nSample data:\n{df.head(3).to_string()}"
            )
            break

    file_names = ", ".join([Path(p).name for p in state['file_paths']]) or "none"

    prompt = PLANNER_PROMPT.format(
        goal=state['goal'],
        file_count=len(state['file_ids']),
        file_names=file_names,
        data_summary=data_summary + column_info,
    )

    response = await llm.ainvoke([{"role": "user", "content": prompt}])
    content = response.content.strip()

    # Parse JSON
    try:
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        tasks = json.loads(content.strip())

        if isinstance(tasks, dict) and "tasks" in tasks:
            tasks = tasks["tasks"]
        if not isinstance(tasks, list) or len(tasks) == 0:
            raise ValueError("Planner returned no tasks")

        normalized_tasks = []
        for i, task in enumerate(tasks):
            if isinstance(task, str):
                task = {
                    "description": task,
                    "requires_data": True,
                }
            if not isinstance(task, dict):
                continue
            if "description" not in task or not str(task["description"]).strip():
                task["description"] = state["goal"]
            if "requires_data" not in task:
                task["requires_data"] = True
            if 'id' not in task:
                task['id'] = f"t{i + 1}"
            task.setdefault('result', None)
            task.setdefault('code_used', None)
            task.setdefault('chart_data', None)
            task.setdefault('expected_output', None)
            normalized_tasks.append(task)

        if len(normalized_tasks) == 0:
            raise ValueError("Planner tasks were invalid")
        tasks = normalized_tasks
    except Exception as e:
        print(f"[Planner] JSON parse error: {e}")
        tasks = [{
            "id": "t1", "description": state['goal'],
            "requires_data": True, "result": None,
            "code_used": None, "chart_data": None
        }]

    print(f"[Planner] Generated {len(tasks)} tasks: {[t['description'] for t in tasks]}")

    await state['stream_callback']('agent_step', {
        'agent': 'Planner', 'status': 'done', 'step': 1,
        'output': f"Created {len(tasks)} analysis tasks",
        'tasks': [t['description'] for t in tasks],
    })

    return {'tasks': tasks, 'raw_data_summary': data_summary + column_info}
