"""Tkinter desktop interface for the offline USB activity analyzer."""

from __future__ import annotations

import tkinter as tk
from pathlib import Path
from tkinter import filedialog, font as tkfont, messagebox, ttk

from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure

from . import __version__
from .analysis import InputError, filter_events, format_utc, load_csv, summarize
from .export import write_csv, write_report

BG = "#101321"
PANEL = "#191e30"
PANEL_ALT = "#222941"
TEXT = "#edf1ff"
MUTED = "#aab5d1"
ACCENT = "#a890ff"
BLUE = "#75c5f8"
MAX_DISPLAY_ROWS = 5_000


class AnalyzerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("USB Device Activity Forensic Analyzer")
        self.root.geometry("1300x840")
        self.root.minsize(960, 650)
        self.root.configure(bg=BG)
        families = set(tkfont.families(self.root))
        self.ui_font = next((f for f in ("Segoe UI", "DejaVu Sans", "Arial") if f in families), "TkDefaultFont")
        self.mono_font = next((f for f in ("Consolas", "DejaVu Sans Mono", "Courier") if f in families), "TkFixedFont")
        self.data = None
        self.visible_events = []
        self.applied_query = ""
        self.applied_type = "all"
        self.query = tk.StringVar()
        self.event_type = tk.StringVar(value="All events")
        self.offset = tk.StringVar(value="+00:00")
        self.status = tk.StringVar(value="Load the fictional sample or import a prepared CSV to begin.")
        self.source = tk.StringVar(value="No source loaded")
        self.metrics = [tk.StringVar(value="—") for _ in range(4)]
        self._style()
        self._layout()

    def _style(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("TLabel", background=BG, foreground=TEXT, font=(self.ui_font, 10))
        style.configure("Muted.TLabel", background=BG, foreground=MUTED, font=(self.ui_font, 9))
        style.configure("Panel.TLabel", background=PANEL, foreground=TEXT, font=(self.ui_font, 10))
        style.configure("Caption.TLabel", background=PANEL, foreground=MUTED, font=(self.ui_font, 9))
        style.configure("Metric.TLabel", background=PANEL, foreground=TEXT, font=(self.ui_font, 23, "bold"))
        style.configure("Heading.TLabel", background=BG, foreground=TEXT, font=(self.ui_font, 20, "bold"))
        style.configure("TButton", background=PANEL_ALT, foreground=TEXT, borderwidth=0, padding=(12, 8), font=(self.ui_font, 9, "bold"))
        style.map("TButton", background=[("active", "#394363"), ("disabled", PANEL)])
        style.configure("Accent.TButton", background=ACCENT, foreground="#151128")
        style.map("Accent.TButton", background=[("active", "#c0afff")])
        style.configure("TEntry", fieldbackground="#f7f8ff", foreground="#161a28", padding=5)
        style.configure("TCombobox", fieldbackground="#f7f8ff", foreground="#161a28", padding=4)
        style.configure("TNotebook", background=BG, borderwidth=0)
        style.configure("TNotebook.Tab", background=PANEL, foreground=MUTED, padding=(16, 9))
        style.map("TNotebook.Tab", background=[("selected", PANEL_ALT)], foreground=[("selected", TEXT)])
        style.configure("Treeview", background=PANEL, fieldbackground=PANEL, foreground=TEXT, rowheight=27, borderwidth=0)
        style.configure("Treeview.Heading", background=PANEL_ALT, foreground=TEXT, relief="flat", padding=6, font=(self.ui_font, 9, "bold"))
        style.map("Treeview", background=[("selected", "#534a83")])

    def _layout(self):
        outer = ttk.Frame(self.root, padding=(20, 16))
        outer.pack(fill="both", expand=True)
        top = ttk.Frame(outer)
        top.pack(fill="x")
        ttk.Label(top, text="USB ACTIVITY  /  FORENSIC ANALYZER", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(top, text="Offline triage workspace  ·  Read the records. Follow the patterns.  ·  v" + __version__, style="Muted.TLabel").pack(anchor="w", pady=(3, 12))

        actions = ttk.Frame(outer)
        actions.pack(fill="x", pady=(0, 10))
        ttk.Button(actions, text="Load sample", command=self.load_sample).pack(side="left", padx=(0, 8))
        ttk.Button(actions, text="Import CSV", style="Accent.TButton", command=self.import_csv).pack(side="left", padx=(0, 14))
        ttk.Label(actions, text="Offset for timestamps without timezone:", style="Muted.TLabel").pack(side="left")
        ttk.Entry(actions, textvariable=self.offset, width=9).pack(side="left", padx=(6, 3))
        ttk.Label(actions, text="±HH:MM", style="Muted.TLabel").pack(side="left")
        ttk.Button(actions, text="Export report", command=self.export_report).pack(side="right")
        ttk.Button(actions, text="Export filtered CSV", command=self.export_csv).pack(side="right", padx=(0, 8))
        ttk.Label(outer, textvariable=self.source, style="Muted.TLabel", wraplength=1200).pack(anchor="w", pady=(0, 10))

        filters = ttk.Frame(outer)
        filters.pack(fill="x", pady=(0, 12))
        ttk.Label(filters, text="SEARCH", style="Muted.TLabel").pack(side="left", padx=(0, 8))
        search = ttk.Entry(filters, textvariable=self.query, width=38)
        search.pack(side="left", padx=(0, 12))
        search.bind("<Return>", lambda _event: self.apply_filters())
        ttk.Label(filters, text="EVENT", style="Muted.TLabel").pack(side="left", padx=(0, 8))
        ttk.Combobox(filters, textvariable=self.event_type, values=("All events", "Connected", "Disconnected", "Other"), state="readonly", width=16).pack(side="left", padx=(0, 8))
        ttk.Button(filters, text="Apply", command=self.apply_filters).pack(side="left", padx=(0, 6))
        ttk.Button(filters, text="Reset", command=self.reset_filters).pack(side="left")

        metric_row = ttk.Frame(outer)
        metric_row.pack(fill="x", pady=(0, 12))
        labels = ["RECORDS IN VIEW", "CONNECTION RECORDS", "DISTINCT DEVICE IDs", "REPEATED IDs"]
        for i, label in enumerate(labels):
            metric_row.columnconfigure(i, weight=1, uniform="metrics")
            card = ttk.Frame(metric_row, style="Panel.TFrame", padding=(15, 10))
            card.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 5, 0 if i == 3 else 5))
            ttk.Label(card, text=label, style="Caption.TLabel").pack(anchor="w")
            ttk.Label(card, textvariable=self.metrics[i], style="Metric.TLabel").pack(anchor="w", pady=(3, 0))

        notebook = ttk.Notebook(outer)
        notebook.pack(fill="both", expand=True)
        overview = ttk.Frame(notebook, style="Panel.TFrame", padding=10)
        event_tab = ttk.Frame(notebook, style="Panel.TFrame", padding=8)
        device_tab = ttk.Frame(notebook, style="Panel.TFrame", padding=8)
        quality_tab = ttk.Frame(notebook, style="Panel.TFrame", padding=10)
        notebook.add(overview, text="Overview")
        notebook.add(event_tab, text="Event timeline")
        notebook.add(device_tab, text="Devices")
        notebook.add(quality_tab, text="Data quality")

        self.figure = Figure(figsize=(11, 4.0), dpi=100, facecolor=PANEL)
        self.canvas = FigureCanvasTkAgg(self.figure, master=overview)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        ttk.Label(overview, text="Repeated IDs have two or more connection records. Duplicate source rows are retained.", style="Caption.TLabel").pack(anchor="w", pady=(4, 0))
        self.event_tree = self._tree(event_tab,
            [("time", "TIME (UTC)", 180), ("type", "EVENT", 110), ("device", "DEVICE ID", 300),
             ("computer", "COMPUTER", 150), ("username", "USER", 140), ("record", "CSV RECORD", 100)])
        self.device_tree = self._tree(device_tab,
            [("device", "DEVICE ID", 300), ("connections", "CONNECTIONS", 110), ("records", "RECORDS", 90),
             ("first", "FIRST SEEN (UTC)", 180), ("last", "LAST SEEN (UTC)", 180), ("computers", "COMPUTERS", 100)])
        self.quality = tk.Text(quality_tab, bg=PANEL, fg=TEXT, insertbackground=TEXT, relief="flat", wrap="word", font=(self.mono_font, 10), padx=10, pady=10)
        quality_scroll = ttk.Scrollbar(quality_tab, command=self.quality.yview)
        self.quality.configure(yscrollcommand=quality_scroll.set, state="disabled")
        quality_scroll.pack(side="right", fill="y")
        self.quality.pack(fill="both", expand=True)
        ttk.Label(outer, textvariable=self.status, style="Muted.TLabel", wraplength=1200).pack(anchor="w", pady=(10, 0))
        self.draw_charts({"daily": [], "devices": []})
        self.update_quality()

    @staticmethod
    def _tree(parent, columns):
        frame = ttk.Frame(parent, style="Panel.TFrame")
        frame.pack(fill="both", expand=True)
        tree = ttk.Treeview(frame, columns=[col[0] for col in columns], show="headings")
        yscroll = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        xscroll = ttk.Scrollbar(frame, orient="horizontal", command=tree.xview)
        tree.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        for key, title, width in columns:
            tree.heading(key, text=title)
            tree.column(key, width=width, minwidth=75, stretch=True)
        yscroll.pack(side="right", fill="y")
        xscroll.pack(side="bottom", fill="x")
        tree.pack(fill="both", expand=True)
        return tree

    def import_csv(self):
        path = filedialog.askopenfilename(title="Open prepared USB activity CSV", filetypes=[("CSV files", "*.csv"), ("All files", "*.*")])
        if path:
            self.open_file(path)

    def load_sample(self):
        path = Path(__file__).resolve().parent.parent / "samples" / "fictional_usb_activity.csv"
        self.open_file(path)

    def open_file(self, path):
        try:
            data = load_csv(path, self.offset.get())
        except (InputError, OSError, ValueError) as exc:
            messagebox.showerror("Could not import CSV", str(exc), parent=self.root)
            return
        self.data = data
        self.source.set(f"SOURCE  {data.filename}  ·  SHA-256  {data.sha256}  ·  Assumed offset for naive timestamps: {data.assumed_offset}")
        self.reset_filters()
        self.update_quality()
        if not data.events:
            messagebox.showwarning("No valid events", "No events could be analyzed. Open Data quality for details.", parent=self.root)

    def reset_filters(self):
        self.query.set("")
        self.event_type.set("All events")
        self.apply_filters()

    def apply_filters(self):
        if not self.data:
            return
        self.applied_query = self.query.get().strip()
        label = self.event_type.get()
        self.applied_type = "all" if label == "All events" else label.casefold()
        self.visible_events = filter_events(self.data.events, self.applied_query, self.applied_type)
        stats = summarize(self.visible_events)
        for variable, value in zip(self.metrics, [stats["records"], stats["connections"], len(stats["devices"]), stats["repeated"]]):
            variable.set(f"{value:,}")
        self.event_tree.delete(*self.event_tree.get_children())
        self.device_tree.delete(*self.device_tree.get_children())
        for event in self.visible_events[:MAX_DISPLAY_ROWS]:
            self.event_tree.insert("", "end", values=(format_utc(event.timestamp), event.event_type,
                event.device_id or "(missing)", event.computer, event.username, event.record_number))
        for device in stats["devices"][:MAX_DISPLAY_ROWS]:
            self.device_tree.insert("", "end", values=(device["device_id"], device["connections"], device["records"],
                format_utc(device["first_seen"]), format_utc(device["last_seen"]), device["computers"]))
        self.draw_charts(stats)
        self.status.set(f"{len(self.visible_events):,} matching records  ·  {len(self.data.issues):,} skipped during import  ·  "
                        f"Tables show up to {MAX_DISPLAY_ROWS:,} rows; exports and totals include all matches.  ·  Times shown in UTC.")

    def update_quality(self):
        if not self.data:
            text = "Load the sample or import a prepared CSV to review source and parsing details."
        else:
            data = self.data
            text = (f"SOURCE QUALITY\n\nFile: {data.filename}\nSHA-256: {data.sha256}\n"
                    f"CSV records: {data.total_records:,}\nValid events: {len(data.events):,}\n"
                    f"Skipped records: {len(data.issues):,}\nNaive timestamps: {data.naive_timestamps:,} "
                    f"(assumed fixed offset {data.assumed_offset})\n\n"
                    "IMPORT ISSUES (first 100)\n" + ("\n".join(data.issues[:100]) if data.issues else "None.") +
                    "\n\nINTERPRETATION\nTimes are normalized to UTC. The original file is unchanged. "
                    "Unknown event types are kept as 'other'; missing IDs are kept but excluded from device counts. "
                    "Duplicate rows are retained. Connection records are not proof of authorization, a physical insertion, "
                    "or a complete activity history. Verify important findings with other evidence.")
        self.quality.configure(state="normal")
        self.quality.delete("1.0", "end")
        self.quality.insert("1.0", text)
        self.quality.configure(state="disabled")

    def draw_charts(self, stats):
        self.figure.clear()
        left, right = self.figure.subplots(1, 2)
        daily = stats["daily"][-30:]
        devices = [d for d in stats["devices"] if d["connections"] > 0][:5]
        for ax in (left, right):
            ax.set_facecolor(PANEL)
            ax.tick_params(colors=MUTED, labelsize=8)
            for spine in ax.spines.values():
                spine.set_visible(False)
            ax.grid(axis="y", color="#333c57", alpha=.5)
            ax.set_axisbelow(True)
        left.set_title("ACTIVITY BY DAY · LAST 30 DAYS WITH RECORDS", color=TEXT, fontsize=10, loc="left", pad=12)
        right.set_title("TOP DEVICE IDs · CONNECTION RECORDS", color=TEXT, fontsize=10, loc="left", pad=12)
        if daily:
            left.bar([x[0] for x in daily], [x[1] for x in daily], color=BLUE)
            left.tick_params(axis="x", rotation=45, labelsize=7)
            left.yaxis.get_major_locator().set_params(integer=True)
        else:
            left.text(.5, .5, "No records to display", color=MUTED, ha="center", va="center", transform=left.transAxes)
            left.set_xticks([]); left.set_yticks([])
        if devices:
            names = [d["device_id"][:23] + ("…" if len(d["device_id"]) > 23 else "") for d in devices][::-1]
            right.barh(names, [d["connections"] for d in devices][::-1], color=ACCENT)
            right.xaxis.get_major_locator().set_params(integer=True)
            right.grid(axis="y", visible=False)
            right.grid(axis="x", color="#333c57", alpha=.5)
        else:
            right.text(.5, .5, "No connection records with device IDs", color=MUTED, ha="center", va="center", transform=right.transAxes)
            right.set_xticks([]); right.set_yticks([])
        self.figure.tight_layout(pad=2.0)
        self.canvas.draw_idle()

    def _export(self, report=False):
        if not self.data:
            messagebox.showinfo("Nothing to export", "Load a CSV first.", parent=self.root)
            return
        extension = ".txt" if report else ".csv"
        path = filedialog.asksaveasfilename(title="Save triage report" if report else "Save filtered events",
            defaultextension=extension, filetypes=[("Text report", "*.txt")] if report else [("CSV file", "*.csv")])
        if not path:
            return
        try:
            if report:
                write_report(path, self.data, self.visible_events, self.applied_query, self.applied_type)
            else:
                write_csv(path, self.data, self.visible_events)
        except (OSError, ValueError) as exc:
            messagebox.showerror("Could not export", str(exc), parent=self.root)
            return
        self.status.set(f"Saved {'report' if report else 'filtered CSV'} to {path}")

    def export_csv(self):
        self._export(False)

    def export_report(self):
        self._export(True)


def main():
    root = tk.Tk()
    AnalyzerApp(root)
    root.mainloop()
