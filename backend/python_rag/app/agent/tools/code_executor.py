import pandas as pd
import numpy as np
import traceback
from pathlib import Path
from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Guards import safe_builtins

# guarded_getitem was removed in newer RestrictedPython versions.
# Provide a simple fallback that allows subscript access (obj[key]).
try:
    from RestrictedPython.Guards import guarded_getitem
except ImportError:
    def guarded_getitem(obj, key):
        return obj[key]


def _strip_imports(code: str) -> str:
    lines = []
    for line in code.splitlines():
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            continue
        lines.append(line)
    return "\n".join(lines)


def execute_analyst_code(code: str, df: pd.DataFrame) -> dict:
    restricted_globals = dict(safe_globals)
    restricted_globals["__builtins__"] = {
        **safe_builtins,
        "len": len,
        "range": range,
        "enumerate": enumerate,
        "zip": zip,
        "list": list,
        "dict": dict,
        "str": str,
        "int": int,
        "float": float,
        "round": round,
        "sum": sum,
        "min": min,
        "max": max,
        "abs": abs,
        "sorted": sorted,
        "print": print,
    }
    restricted_globals["pd"] = pd
    restricted_globals["np"] = np
    restricted_globals["df"] = df.copy()
    restricted_globals["result"] = None
    restricted_globals["chart_data"] = None
    restricted_globals["_getitem_"] = guarded_getitem

    try:
        sanitized = _strip_imports(code)
        byte_code = compile_restricted(sanitized, "<analyst>", "exec")
        exec(byte_code, restricted_globals)

        result = restricted_globals.get("result")
        chart_data = restricted_globals.get("chart_data")
        result_meta = {}  # Metadata from structured result

        # Handle structured dict result format:
        # {"computed": True, "formula_used": "...", "columns_used": [...], "value": "..."}
        if isinstance(result, dict) and "value" in result:
            result_meta = {
                "computed": result.get("computed", False),
                "formula_used": result.get("formula_used", ""),
                "columns_used": result.get("columns_used", []),
            }
            # Extract chart_data from result dict if present and not set separately
            if chart_data is None and "chart_data" in result and isinstance(result["chart_data"], dict):
                chart_data = result["chart_data"]
            result_str = str(result["value"])
            print(f"[execute_analyst_code] Structured result: computed={result_meta['computed']}, "
                  f"formula={result_meta['formula_used']}")
        elif isinstance(result, (pd.DataFrame, pd.Series)):
            result_str = result.to_string()
        elif result is not None:
            result_str = str(result)
        else:
            result_str = "No result variable set"

        if chart_data and not isinstance(chart_data, dict):
            chart_data = None

        return {
            "success": True,
            "result": result_str,
            "result_meta": result_meta,
            "chart_data": chart_data,
            "error": None,
            "code_used": sanitized,
        }
    except Exception as exc:
        return {
            "success": False,
            "result": None,
            "result_meta": {},
            "chart_data": None,
            "error": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
            "code_used": code,
        }


def load_dataframe(file_path: str) -> pd.DataFrame | None:
    """
    Load a CSV or XLSX file into a clean DataFrame.

    For XLSX files: tries header row 0 and 1 for every sheet,
    picks the sheet+header combination that gives the most
    properly named (non-"Unnamed") columns with real data.
    Resets index so rows are always clean 0-based integers.
    """
    try:
        p = Path(file_path)
        if not p.exists():
            print(f"[load_dataframe] FILE NOT FOUND: {file_path}")
            return None

        if p.suffix.lower() == '.csv':
            df = pd.read_csv(str(p))
            df = df.dropna(how='all').dropna(axis=1, how='all')
            df = df.reset_index(drop=True)
            print(f"[load_dataframe] loaded CSV: shape={df.shape}, columns={df.columns.tolist()}")
            return df

        elif p.suffix.lower() in ('.xlsx', '.xls'):
            xl = pd.ExcelFile(str(p))
            best_df    = None
            best_score = 0
            best_info  = ""

            for sheet in xl.sheet_names:
                for header_row in [0, 1]:
                    try:
                        df = pd.read_excel(str(p), sheet_name=sheet, header=header_row)
                        df = df.dropna(how='all').dropna(axis=1, how='all')
                        df = df.reset_index(drop=True)

                        # Score: reward named columns, penalise "Unnamed"
                        named_cols = sum(
                            1 for c in df.columns
                            if not str(c).startswith('Unnamed')
                        )
                        non_null   = int(df.notna().sum().sum())
                        score      = named_cols * 20 + non_null

                        print(f"[load_dataframe] sheet='{sheet}' header={header_row} "
                              f"named_cols={named_cols} non_null={non_null} score={score} "
                              f"columns={df.columns.tolist()}")

                        if score > best_score:
                            best_score = score
                            best_df    = df.copy()
                            best_df.attrs['sheet_name'] = sheet
                            best_df.attrs['header_row'] = header_row
                            best_info  = f"sheet='{sheet}' header={header_row}"

                    except Exception as e:
                        print(f"[load_dataframe] sheet='{sheet}' header={header_row} ERROR: {e}")

            if best_df is not None:
                print(f"[load_dataframe] SELECTED {best_info} "
                      f"columns={best_df.columns.tolist()} shape={best_df.shape}")
            else:
                print("[load_dataframe] ERROR: no usable sheet found")
            return best_df

        else:
            print(f"[load_dataframe] unsupported extension: {p.suffix}")
            return None

    except Exception as e:
        print(f"[load_dataframe] FATAL ERROR loading {file_path}: {e}")
        return None


def get_df_summary(df: pd.DataFrame) -> str:
    """
    Return a detailed summary of a DataFrame for injection into agent prompts.
    Includes exact column names so Groq never guesses them.
    """
    sheet = df.attrs.get('sheet_name', 'unknown')
    numeric_cols = df.select_dtypes(include='number').columns.tolist()

    lines = [
        f"Sheet: {sheet}",
        f"Shape: {df.shape[0]} rows x {df.shape[1]} columns",
        f"",
        f"EXACT COLUMN NAMES (copy these exactly when writing code):",
        f"  {df.columns.tolist()}",
        f"",
        f"Numeric columns: {numeric_cols}",
        f"",
        f"First 5 rows (including index):",
        df.head(5).to_string(index=True),
        f"",
        f"Data types:",
        df.dtypes.to_string(),
    ]
    return "\n".join(lines)
