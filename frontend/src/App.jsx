
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "http://127.0.0.1:5000";

const ACCEPTED =
  ".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.pdf,.pptx,.mp4,.mov,.avi,.mkv,.webm";

function sizeText(bytes = 0) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [verification, setVerification] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  async function analyzeFile(selectedFile) {
    if (!selectedFile) {
      setError("Choose a file or capture a document first.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus(`Examining ${selectedFile.name}...`);
    setResult(null);
    setVerification(null);

    const body = new FormData();
    body.append("file", selectedFile);

    try {
      const response = await axios.post(`${API}/api/analyze`, body, {
        timeout: 300000,
      });

      setResult(response.data);
      setStatus("Examination complete.");
    } catch (err) {
      const message =
        err.response?.data?.error ||
        (err.code === "ECONNABORTED"
          ? "The scan took too long. Try a smaller PDF or fewer pages."
          : "Cannot connect to the Python server. Start backend/app.py and try again.");

      setError(message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setError("");
    setResult(null);
    setStatus("");
    setFile(selected);

    if (selected.size > 100 * 1024 * 1024) {
      setFile(null);
      setError("The file is larger than 100 MB. Please select a smaller file.");
      event.target.value = "";
      return;
    }

    // Automatically scan a selected PDF.
    if (selected.name.toLowerCase().endsWith(".pdf")) {
      analyzeFile(selected);
    }
  }

  async function openScanner() {
    setScannerOpen(true);
    setCameraError("");
    setError("");
  }

  useEffect(() => {
    if (!scannerOpen) return undefined;

    let cancelled = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera access is unavailable. Use localhost or HTTPS, or upload a ticket photo instead."
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access in your browser, or upload a ticket photo."
              : err.message ||
                  "Could not start the camera. You can still upload a document."
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [scannerOpen]);

  function closeScanner() {
    setScannerOpen(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth) {
      setCameraError(
        "Wait for the camera preview to start, then try again."
      );
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setCameraError("Could not capture the image. Please try again.");
          return;
        }

        const captured = new File(
          [blob],
          `camera-scan-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );

        setFile(captured);
        closeScanner();
        await analyzeFile(captured);
      },
      "image/jpeg",
      0.94
    );
  }

  async function loadHistory() {
    try {
      const response = await axios.get(`${API}/api/history`);

      setHistory(response.data.records || []);
      setShowHistory(true);
      setError("");
    } catch {
      setError(
        "Could not load history. Check that the backend is running."
      );
    }
  }

  async function verifyLog() {
    try {
      const response = await axios.post(`${API}/api/verify-log`);

      setVerification(response.data);
      setError("");
    } catch {
      setError("Could not verify the evidence log.");
    }
  }

  function downloadReport() {
    if (!result) return;

    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `EvidenceGuard-${
      result.evidence_record?.evidence_id || "report"
    }.json`;

    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text || "");
      setStatus("Copied to clipboard.");
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  }

  const metadata =
    result?.pdf_details?.metadata ||
    result?.exif_metadata ||
    {};

  const detectedDetails = result?.detected_details || {};
  const pageSummaries = result?.pdf_details?.page_summaries || [];

  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="topbar">
        <div className="brand-icon">EG</div>

        <div className="brand-copy">
          <h1>EvidenceGuard AI</h1>
          <p>Digital Evidence Forensics Assistant</p>
        </div>
      </header>

      <main className="container">
        {/* HERO SECTION */}
        <section className="hero">
          <div className="eyebrow">
            DIGITAL EVIDENCE FORENSICS
          </div>

          <h2>
            Examine evidence.
            <br />
            <span>Understand the signals.</span>
          </h2>

          <p>
            Read document text, inspect PDF metadata, scan ticket photos,
            decode QR codes and preserve a record of each examination.
          </p>

          <div className="hero-tags">
            <span>PDF + OCR</span>
            <span>Camera scanner</span>
            <span>Ticket details</span>
            <span>QR analysis</span>
            <span>Evidence history</span>
          </div>
        </section>

        {/* FILE UPLOAD */}
        <section className="panel">
          <div className="panel-heading">
            <div className="step">01</div>

            <div>
              <h3>Choose your evidence</h3>
              <p>
                Select a PDF, image, PowerPoint or video.
                PDFs start scanning automatically.
              </p>
            </div>
          </div>

          <label className="drop-zone">
            <div className="upload-symbol">↑</div>

            <strong>
              {file
                ? file.name
                : "Choose a file from your device"}
            </strong>

            <span>
              Images · PDF · PowerPoint · Video · Up to 100 MB
            </span>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              onChange={chooseFile}
            />
          </label>

          {file && (
            <div className="file-summary">
              <div className="file-type">
                {file.name.split(".").pop()?.toUpperCase() || "FILE"}
              </div>

              <div>
                <strong>{file.name}</strong>
                <p>{sizeText(file.size)}</p>
              </div>
            </div>
          )}

          <div className="button-row main-actions">
            <button
              className="primary-button"
              onClick={openScanner}
              disabled={loading}
            >
              <span>▣</span> Scan Ticket / Document
            </button>

            {file && !file.name.toLowerCase().endsWith(".pdf") && (
              <button
                className="secondary-button"
                onClick={() => analyzeFile(file)}
                disabled={loading}
              >
                Analyze selected file
              </button>
            )}
          </div>

          <p className="muted">
            Camera scanning requires permission. You can also upload a
            clear photo if camera access is unavailable.
          </p>

          {loading && (
            <div className="loading-box">
              <div className="spinner" />

              <div>
                <strong>Examining your evidence...</strong>
                <p>
                  Reading text, metadata and available QR codes.
                  Large PDFs may take time.
                </p>
              </div>
            </div>
          )}

          {status && !loading && (
            <p className="success-text">{status}</p>
          )}

          {error && <div className="error-box">{error}</div>}
        </section>

        {/* CAMERA SCANNER */}
        {scannerOpen && (
          <section className="panel scanner-panel">
            <div className="panel-heading">
              <div className="step">SCAN</div>

              <div>
                <h3>Ticket / Document Scanner</h3>
                <p>
                  Place the whole ticket inside the camera frame.
                </p>
              </div>
            </div>

            <div className="scanner-frame">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />

              <div className="scan-corners" />
            </div>

            <canvas
              ref={canvasRef}
              className="hidden-canvas"
            />

            {cameraError && (
              <div className="error-box">{cameraError}</div>
            )}

            <div className="button-row">
              <button
                className="primary-button"
                onClick={capturePhoto}
                disabled={Boolean(cameraError) || loading}
              >
                Capture and Analyze
              </button>

              <button
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload instead
              </button>

              <button
                className="secondary-button"
                onClick={closeScanner}
              >
                Close Scanner
              </button>
            </div>

            <p className="muted">
              Keep the ticket flat, well-lit and fully visible.
              The captured photo is sent to your local Python server.
            </p>
          </section>
        )}

        {/* RESULTS */}
        {result && (
          <>
            <section className="panel results-panel">
              <div className="panel-heading">
                <div className="step">02</div>

                <div>
                  <h3>Examination Results</h3>
                  <p>
                    {result.filename} · {result.file_type?.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="overview-grid">
                <div className="metric">
                  <span>File type</span>
                  <strong>{result.file_type?.toUpperCase()}</strong>
                </div>

                <div className="metric">
                  <span>File size</span>
                  <strong>{sizeText(result.file_size_bytes)}</strong>
                </div>

                <div className="metric">
                  <span>Evidence ID</span>
                  <strong>
                    {result.evidence_record?.evidence_id || "—"}
                  </strong>
                </div>

                <div className="metric">
                  <span>Technical signals</span>
                  <strong>{result.signals?.length || 0}</strong>
                </div>
              </div>

              <div className="verdict-box">
                <span>Authenticity status</span>
                <strong>Cannot be confirmed automatically</strong>
                <p>{result.summary}</p>
              </div>
            </section>

            {/* METADATA */}
            {Object.keys(metadata).length > 0 && (
              <section className="panel">
                <div className="panel-heading">
                  <div className="step">03</div>

                  <div>
                    <h3>Creator & File Metadata</h3>
                    <p>
                      Information stored in the file, when available
                    </p>
                  </div>
                </div>

                <div className="metadata-list">
                  {Object.entries(metadata).map(([key, value]) => (
                    <div className="metadata-row" key={key}>
                      <strong>{key}</strong>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* DETECTED DETAILS */}
            {Object.keys(detectedDetails).length > 0 && (
              <section className="panel">
                <div className="panel-heading">
                  <div className="step">04</div>

                  <div>
                    <h3>Detected Ticket / Document Details</h3>
                    <p>
                      Details found in the extracted text; verify them
                      manually.
                    </p>
                  </div>
                </div>

                {Object.entries(detectedDetails).map(([label, values]) => (
                  <div className="detail-row" key={label}>
                    <strong>{label}</strong>

                    <div>
                      {values.map((value, i) => (
                        <span key={i}>{value}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* QR RESULTS */}
            {result.qr_analysis && (
              <section className="panel">
                <div className="panel-heading">
                  <div className="step">05</div>

                  <div>
                    <h3>QR Code Results</h3>
                    <p>{result.qr_analysis.status}</p>
                  </div>
                </div>

                {(result.qr_analysis.codes || []).map((code, index) => (
                  <div className="text-preview" key={index}>
                    <strong>QR code {index + 1}</strong>

                    <p>
                      {code.text ||
                        "QR region found, but its content could not be decoded."}
                    </p>

                    {code.text && (
                      <button
                        className="secondary-button"
                        onClick={() => copyText(code.text)}
                      >
                        Copy QR content
                      </button>
                    )}
                  </div>
                ))}

                {!result.qr_analysis.codes?.length && (
                  <p className="muted">
                    No QR code was detected. Other analysis results
                    are still available.
                  </p>
                )}
              </section>
            )}

            {/* PDF PAGE RESULTS */}
            {pageSummaries.length > 0 && (
              <section className="panel">
                <div className="panel-heading">
                  <div className="step">06</div>

                  <div>
                    <h3>PDF Page-by-Page Results</h3>
                    <p>
                      {result.pdf_details.pages} total page(s);
                      {" "}
                      {result.pdf_details.pages_inspected} inspected.
                    </p>
                  </div>
                </div>

                {pageSummaries.map((page) => (
                  <details
                    className="page-card"
                    key={page.page}
                    open={page.page === 1}
                  >
                    <summary>
                      Page {page.page} · {page.characters_extracted} characters
                      {" "}· {page.method}
                    </summary>

                    <pre>
                      {page.text ||
                        "No text could be extracted from this page."}
                    </pre>
                  </details>
                ))}

                {(result.pdf_details.ocr_warnings || []).map(
                  (warning, i) => (
                    <div className="info-box" key={i}>
                      {warning}
                    </div>
                  )
                )}
              </section>
            )}

            {/* EXTRACTED TEXT */}
            {result.ocr_text && (
              <section className="panel">
                <div className="panel-heading">
                  <div className="step">07</div>

                  <div>
                    <h3>Extracted Text</h3>
                    <p>
                      Searchable text read from the document or image
                    </p>
                  </div>
                </div>

                <pre className="full-text">{result.ocr_text}</pre>

                <button
                  className="secondary-button"
                  onClick={() => copyText(result.ocr_text)}
                >
                  Copy extracted text
                </button>
              </section>
            )}

            {result.ocr_error && (
              <div className="error-box">{result.ocr_error}</div>
            )}

            {/* POWERPOINT RESULTS */}
            {result.pptx_details?.slide_summaries?.map((slide) => (
              <section className="panel" key={slide.slide}>
                <h3>Slide {slide.slide}</h3>
                <pre>{slide.text || "No selectable text found."}</pre>
              </section>
            ))}

            {/* VIDEO RESULTS */}
            {result.video_details && (
              <section className="panel">
                <h3>Video Details</h3>

                <p>
                  Duration:{" "}
                  {result.video_details.duration_seconds ?? "Unknown"} seconds
                </p>

                <p>
                  Frames sampled:{" "}
                  {result.video_details.sampled_frames?.length || 0}
                </p>

                {result.video_details.sampled_frames?.map((frame) => (
                  <div className="text-preview" key={frame.frame}>
                    <strong>
                      Frame {frame.frame} ·{" "}
                      {frame.timestamp_seconds ?? "?"} seconds
                    </strong>

                    <p>
                      {frame.ocr_text || "No text found in this frame."}
                    </p>

                    {frame.qr_codes?.map((qr, i) => (
                      <p key={i}>
                        QR: {qr.text || "Unreadable"}
                      </p>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {/* ERROR LEVEL ANALYSIS */}
            {result.ela_image && (
              <section className="panel">
                <h3>Error Level Analysis Heatmap</h3>

                <img
                  className="ela-image"
                  src={`data:image/jpeg;base64,${result.ela_image}`}
                  alt="Error Level Analysis heatmap"
                />

                <p className="muted">
                  Differences can be caused by compression and do not
                  prove tampering.
                </p>
              </section>
            )}

            {/* TECHNICAL SIGNALS */}
            <section className="panel">
              <div className="panel-heading">
                <div className="step">08</div>

                <div>
                  <h3>Technical Signals</h3>
                  <p>
                    Clues that may need further examination
                  </p>
                </div>
              </div>

              {(result.signals || []).map((signal, i) => (
                <div
                  className="signal"
                  key={`${signal.name}-${i}`}
                >
                  <div className="signal-top">
                    <strong>{signal.name}</strong>
                    <span className="status">{signal.status}</span>
                  </div>

                  <p>{signal.detail}</p>
                </div>
              ))}

              {(result.limitations || []).map((item, i) => (
                <p className="muted" key={i}>
                  • {item}
                </p>
              ))}
            </section>

            {/* EVIDENCE INTEGRITY */}
            <section className="panel">
              <h3>Evidence Integrity Record</h3>

              <p>
                <strong>SHA-256 fingerprint</strong>
              </p>

              <code className="hash-code">{result.sha256}</code>

              <button
                className="secondary-button"
                onClick={() => copyText(result.sha256)}
              >
                Copy fingerprint
              </button>

              <p>
                <strong>Analysis time:</strong>{" "}
                {result.analysis_timestamp_utc}
              </p>

              <p>
                <strong>Record hash:</strong>
              </p>

              <code className="hash-code">
                {result.evidence_record?.record_hash}
              </code>

              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() =>
                    copyText(result.evidence_record?.record_hash)
                  }
                >
                  Copy record hash
                </button>

                <button
                  className="primary-button"
                  onClick={downloadReport}
                >
                  Download Full JSON Report
                </button>
              </div>

              <p className="muted">
                This prototype saves a local history record. A file hash
                identifies the file's bytes; it does not prove that the
                original file is genuine.
              </p>
            </section>
          </>
        )}

        {/* SCAN HISTORY */}
        <section className="panel">
          <div className="panel-heading">
            <div className="step">↻</div>

            <div>
              <h3>Past Scans</h3>
              <p>
                View saved history and check record links on this computer.
              </p>
            </div>
          </div>

          <div className="button-row">
            <button
              className="secondary-button"
              onClick={loadHistory}
            >
              Show Past Scans
            </button>

            <button
              className="secondary-button"
              onClick={verifyLog}
            >
              Check Saved History
            </button>
          </div>

          {verification && (
            <div className="info-box">
              Log verification:{" "}
              <strong>
                {verification.valid ? "PASSED" : "FAILED"}
              </strong>
              {" "}· {verification.records_checked} record(s) checked.

              {verification.errors?.map((item, i) => (
                <p key={i}>{item}</p>
              ))}
            </div>
          )}

          {showHistory && (
            <div className="history-list">
              {history.map((record, i) => (
                <div
                  className="history-item"
                  key={record.evidence_id || i}
                >
                  <strong>{record.filename}</strong>

                  <span>
                    {record.evidence_id} · {record.timestamp_utc}
                  </span>

                  <code>{record.sha256}</code>
                </div>
              ))}

              {!history.length && <p>No saved scans yet.</p>}
            </div>
          )}
        </section>

        {/* UPDATED FOOTER WITH EMAIL */}
        <footer>
          <strong>EvidenceGuard AI</strong>

          <span>Digital Evidence Forensics Assistant</span>

          <a href="mailto:andhalkaryashashri@gmail.com">
            andhalkaryashashri@gmail.com
          </a>

          <span>
            Keep the original ticket or document safe.
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;
