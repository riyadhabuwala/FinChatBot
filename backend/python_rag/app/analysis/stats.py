import pandas as pd
import numpy as np


def _detect_date_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        if "date" in str(col).lower():
            return col
    return None


def compute_financial_stats(file_paths: list[str]) -> dict:
    numeric_summaries = {}
    anomalies = []
    total_rows = 0
    columns = set()
    time_series = {}
    files_analyzed = 0
    all_periods = []

    for path in file_paths:
        if not path.lower().endswith((".csv", ".xlsx", ".xls")):
            continue
        files_analyzed += 1
        if path.lower().endswith(".csv"):
            df = pd.read_csv(path)
        else:
            df = pd.read_excel(path)
        total_rows += len(df)
        columns.update([str(c) for c in df.columns])

        date_col = _detect_date_column(df)
        if date_col:
            df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
            df = df.sort_values(date_col)
            all_periods.extend(df[date_col].dropna().astype(str).tolist())

        numeric_df = df.select_dtypes(include=[np.number])
        for col in numeric_df.columns:
            series = numeric_df[col].dropna()
            if series.empty:
                continue
            mean_val = float(series.mean())
            std_val = float(series.std())
            outliers = series[series > mean_val + 2 * std_val].tolist()
            numeric_summaries[str(col)] = {
                "mean": mean_val,
                "median": float(series.median()),
                "std": std_val,
                "min": float(series.min()),
                "max": float(series.max()),
                "outliers": outliers,
            }

            if date_col:
                changes = series.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0).tolist()
                time_series[str(col)] = {
                    "values": series.tolist(),
                    "periods": df[date_col].astype(str).tolist(),
                    "changes_pct": changes,
                }

            if std_val and std_val > 0:
                for value in outliers:
                    anomalies.append(
                        {
                            "column": str(col),
                            "value": value,
                            "period": None,
                            "deviation_sigma": float((value - mean_val) / std_val),
                        }
                    )

    return {
        "files_analyzed": files_analyzed,
        "total_rows": total_rows,
        "columns": sorted(columns),
        "numeric_summaries": numeric_summaries,
        "time_series": time_series if time_series else None,
        "anomalies": anomalies,
        "date_range": {
            "start": min(all_periods) if all_periods else None,
            "end": max(all_periods) if all_periods else None,
        },
    }
