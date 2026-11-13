# Setup and testing

## Browser app

[Open the live analyzer](https://namitesh07.github.io/usb-device-activity-forensic-analyzer/) in a current browser. Select **Try two-file demo**, **Try fictional sample**, or choose prepared CSV files and select **Preview files**. Review each source's column mapping and fixed offset or IANA time zone, confirm the prepared event meanings, then select **Analyze reviewed sources**. The default fixed offset is `+00:00`.

See the [input and evidence guide](INPUTS.md) for the CSV format, size limits, timezone handling, data quality, and export limitations. Analysis happens in the browser; the app does not upload evidence or save the current case automatically. Save exports separately from the original evidence.

### Run a local copy

Download or clone the repository, then open `index.html` in a current browser. If the browser cannot calculate SHA-256 on local files, run a local server from the project folder:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`. Python is needed only for this optional local server; the browser app itself has no backend or runtime package dependencies. SHA-256 requires HTTPS, localhost, or another supported secure context.

## Desktop app

The original v1.0 Python/Tkinter app is still included. Install Python 3.10–3.12 with Tkinter. Some Linux distributions provide Tkinter in a separate `python3-tk` package.

On Windows PowerShell, from the project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

On macOS or Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

## Tests

Run the browser analysis tests with Node.js:

```bash
node --test tests/browser-analysis.test.cjs tests/phase1.test.cjs
```

After installing the desktop requirements, run the Python tests:

```bash
python -m unittest discover -s tests -v
```
