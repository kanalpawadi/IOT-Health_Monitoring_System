"""Caregiver PDF report: vitals charts, statistics, alert log and AI summary."""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Sequence

import matplotlib

matplotlib.use("Agg")  # headless: no GUI backend on a server
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_CENTER  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .ai import DISCLAIMER

ACCENT = colors.HexColor("#0ea5e9")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")

SEVERITY_COLOR = {
    "normal": colors.HexColor("#10b981"),
    "warning": colors.HexColor("#f59e0b"),
    "critical": colors.HexColor("#ef4444"),
}

CHART_SPECS = [
    ("heart_rate", "Heart rate", "BPM", "#ef4444", (60, 100)),
    ("spo2", "Blood oxygen (SpO2)", "%", "#0ea5e9", (95, 100)),
    ("temperature_c", "Body temperature", "°C", "#f59e0b", (36.1, 37.5)),
]


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("TitleBig", parent=ss["Title"], fontSize=20,
                          textColor=INK, spaceAfter=2))
    ss.add(ParagraphStyle("SubTitle", parent=ss["Normal"], fontSize=10,
                          textColor=MUTED, alignment=TA_CENTER, spaceAfter=14))
    ss.add(ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13,
                          textColor=ACCENT, spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle("Body", parent=ss["Normal"], fontSize=9.5,
                          leading=14, textColor=INK))
    ss.add(ParagraphStyle("Small", parent=ss["Normal"], fontSize=8,
                          textColor=MUTED, leading=11))
    return ss


def _chart(series: Sequence[dict[str, Any]], key: str, title: str,
           unit: str, color: str, band: tuple[float, float]) -> io.BytesIO | None:
    points = [(r["recorded_at"], r[key]) for r in series if r.get(key) is not None]
    if len(points) < 2:
        return None

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]

    fig, ax = plt.subplots(figsize=(7.2, 2.3), dpi=150)
    ax.axhspan(band[0], band[1], color=color, alpha=0.07, lw=0)
    ax.plot(xs, ys, color=color, lw=1.6, solid_capstyle="round")
    ax.fill_between(xs, ys, min(ys), color=color, alpha=0.10, lw=0)

    ax.set_title(f"{title} ({unit})", fontsize=10, loc="left",
                 color="#0f172a", pad=8)
    ax.grid(True, axis="y", color="#e2e8f0", lw=0.7)
    ax.set_axisbelow(True)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color("#cbd5e1")
    ax.tick_params(colors="#64748b", labelsize=7.5)

    span_hours = (xs[-1] - xs[0]).total_seconds() / 3600
    fmt = "%d %b" if span_hours > 48 else ("%H:%M" if span_hours > 1 else "%H:%M:%S")
    ax.xaxis.set_major_formatter(mdates.DateFormatter(fmt))
    fig.autofmt_xdate(rotation=0, ha="center")
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


def _stats_table(stats: dict[str, Any]) -> Table:
    header = ["Vital", "Average", "Minimum", "Maximum", "Expected range"]
    ranges = {"heart_rate": "60-100 BPM", "spo2": "95-100 %",
              "temperature_c": "36.1-37.5 °C"}
    labels = {"heart_rate": "Heart rate", "spo2": "Blood oxygen (SpO2)",
              "temperature_c": "Body temperature"}

    rows = [header]
    for key in ("heart_rate", "spo2", "temperature_c"):
        s = stats.get(key) or {}
        rows.append([
            labels[key],
            "-" if s.get("avg") is None else f"{s['avg']}",
            "-" if s.get("min") is None else f"{s['min']}",
            "-" if s.get("max") is None else f"{s['max']}",
            ranges[key],
        ])

    t = Table(rows, colWidths=[46 * mm, 25 * mm, 25 * mm, 25 * mm, 40 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _alerts_table(alerts: Sequence[dict[str, Any]], styles) -> Table:
    rows = [["Time", "Severity", "Vital", "Value", "What the rule engine found"]]
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]

    for i, a in enumerate(alerts, start=1):
        ts = datetime.fromisoformat(a["created_at"])
        rows.append([
            ts.strftime("%d %b %H:%M:%S"),
            a["severity"].upper(),
            a["metric"].replace("_", " "),
            "-" if a["value"] is None else f"{a['value']:g}",
            Paragraph(a["message"], styles["Small"]),
        ])
        style_cmds.append(
            ("TEXTCOLOR", (1, i), (1, i), SEVERITY_COLOR.get(a["severity"], INK))
        )
        style_cmds.append(("FONTNAME", (1, i), (1, i), "Helvetica-Bold"))

    t = Table(rows, colWidths=[26 * mm, 20 * mm, 24 * mm, 17 * mm, 74 * mm],
              repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


def build_report(
    *,
    device_id: str,
    patient_name: str | None,
    start: datetime,
    end: datetime,
    series: Sequence[dict[str, Any]],
    stats: dict[str, Any],
    alerts: Sequence[dict[str, Any]],
    ai_summary: dict[str, Any] | None,
    status: str,
) -> bytes:
    """Render the report and return the PDF bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Health Monitoring Report - {device_id}",
        author="AI-Enabled IoT Remote Patient Health Monitoring System",
    )
    ss = _styles()
    story: list[Any] = []

    # ---- header ---------------------------------------------------------- #
    story.append(Paragraph("Patient Health Monitoring Report", ss["TitleBig"]))
    story.append(Paragraph(
        f"{patient_name or 'Unnamed patient'} &nbsp;&bull;&nbsp; device {device_id}<br/>"
        f"{start.strftime('%d %b %Y, %H:%M')} to {end.strftime('%d %b %Y, %H:%M')}"
        f" &nbsp;&bull;&nbsp; generated {datetime.now().strftime('%d %b %Y, %H:%M')}",
        ss["SubTitle"],
    ))

    badge = Table(
        [[f"Current status: {status.upper()}"]],
        colWidths=[161 * mm],
    )
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SEVERITY_COLOR.get(status, MUTED)),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(badge)

    # ---- AI summary ------------------------------------------------------ #
    if ai_summary:
        story.append(Paragraph("AI monitoring summary", ss["H2"]))
        if ai_summary.get("headline"):
            story.append(Paragraph(f"<b>{ai_summary['headline']}</b>", ss["Body"]))
            story.append(Spacer(1, 4))
        story.append(Paragraph(ai_summary.get("summary", ""), ss["Body"]))
        story.append(Spacer(1, 5))
        story.append(Paragraph(
            f"{DISCLAIMER} Model: {ai_summary.get('model', 'n/a')}.", ss["Small"]
        ))

    # ---- statistics ------------------------------------------------------ #
    story.append(Paragraph("Summary statistics", ss["H2"]))
    story.append(Paragraph(
        f"{stats.get('total_readings', 0)} readings in the selected period.",
        ss["Small"],
    ))
    story.append(Spacer(1, 6))
    story.append(_stats_table(stats))

    # ---- charts ---------------------------------------------------------- #
    story.append(Paragraph("Trends", ss["H2"]))
    drew_any = False
    for key, title, unit, color, band in CHART_SPECS:
        img = _chart(series, key, title, unit, color, band)
        if img is None:
            continue
        drew_any = True
        story.append(Image(img, width=161 * mm, height=51 * mm))
        story.append(Spacer(1, 6))
    if not drew_any:
        story.append(Paragraph(
            "Not enough data in this period to plot a trend.", ss["Small"]
        ))

    # ---- alerts ---------------------------------------------------------- #
    story.append(PageBreak())
    story.append(Paragraph("Alert history", ss["H2"]))
    if alerts:
        story.append(_alerts_table(alerts, ss))
    else:
        story.append(Paragraph(
            "No alerts were raised during this period.", ss["Body"]
        ))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "Alerts on this page are produced by a deterministic threshold and "
        "persistence rule engine. The AI summary above explains those findings "
        "in plain language; it does not decide them. This report is monitoring "
        "assistance and is not a medical diagnosis.",
        ss["Small"],
    ))

    doc.build(story)
    return buf.getvalue()
