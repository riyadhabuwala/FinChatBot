import pandas as pd


def build_line_chart(df: pd.DataFrame, x_col: str, y_col: str, title: str) -> dict:
    labels = df[x_col].astype(str).tolist()
    data = df[y_col].tolist()
    return {
        "type": "line",
        "title": title,
        "labels": labels,
        "datasets": [
            {
                "label": y_col,
                "data": data,
                "color": "#1D9E75",
            }
        ],
    }
