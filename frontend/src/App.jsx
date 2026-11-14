
import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import {
  BrainCircuit,
  UploadCloud,
  FileText,
  Trash2,
  BriefcaseBusiness,
  Sparkles,
  ArrowUpRight,
  Download,
  Users,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { Sun, Moon } from "lucide-react";
import "./App.css";

const API_URL = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/analyze`;

function App() {
  const fileInputRef = useRef(null);

  const [jd, setJd] = useState("");
  const [files, setFiles] = useState([]);
  const [threshold, setThreshold] = useState(60);

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [results, setResults] = useState([]);
  const [failedFiles, setFailedFiles] = useState([]);
  const [analysisInfo, setAnalysisInfo] = useState(null);

  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [expandedCandidate, setExpandedCandidate] = useState(null);

  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("talentiq-theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light"
    );

    localStorage.setItem(
      "talentiq-theme",
      darkMode ? "dark" : "light"
    );
  }, [darkMode]);
  // Show elapsed analysis time.
  useEffect(() => {
    if (!loading) return;

    const timer = setInterval(() => {
      setElapsed((previous) => previous + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [loading]);

  const shortlisted = results.filter(
    (candidate) => candidate.score >= threshold
  );

  const selectedCount = selectedCandidates.length;

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  // Add files without adding duplicates.
  const addFiles = (selectedFiles) => {
    const validFiles = Array.from(selectedFiles).filter((file) => {
      const extension = file.name.split(".").pop().toLowerCase();
      return ["pdf", "docx", "txt"].includes(extension);
    });

    const invalidCount = selectedFiles.length - validFiles.length;

    setFiles((previous) => {
      const existing = new Set(
        previous.map(
          (file) =>
            `${file.name}-${file.size}-${file.lastModified}`
        )
      );

      const newFiles = validFiles.filter(
        (file) =>
          !existing.has(
            `${file.name}-${file.size}-${file.lastModified}`
          )
      );

      return [...previous, ...newFiles];
    });

    if (invalidCount > 0) {
      setError(
        `${invalidCount} unsupported file(s) were ignored. Use PDF, DOCX or TXT.`
      );
    } else {
      setError("");
    }
  };

  const handleFiles = (event) => {
    addFiles(event.target.files || []);
    event.target.value = "";
  };

  const removeFile = (index) => {
    setFiles((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index)
    );
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  // Start a fresh analysis.
  const resetAnalysis = () => {
    setResults([]);
    setFailedFiles([]);
    setAnalysisInfo(null);
    setSelectedCandidates([]);
    setExpandedCandidate(null);
    setError("");
  };

  // Analyze resumes using the existing FastAPI backend.
  const analyzeResumes = async () => {
    if (!jd.trim()) {
      setError("Please paste a job description first.");
      return;
    }

    if (!files.length) {
      setError("Please upload at least one resume.");
      return;
    }

    setLoading(true);
    setElapsed(0);
    setError("");
    resetAnalysis();

    const controller = new AbortController();

    // Allow up to 10 minutes for sequential AI processing.
    const timeout = setTimeout(() => {
      controller.abort();
    }, 600000);

    try {
      const formData = new FormData();

      formData.append("jd_text", jd);
      formData.append("threshold", String(threshold));

      files.forEach((file) => {
        formData.append("resumes", file);
      });

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(", ")
          : data.detail;

        throw new Error(detail || "Resume analysis failed.");
      }

      setResults(data.results || []);
      setFailedFiles(data.failed_files || []);

      setAnalysisInfo({
        totalUploaded: data.total_uploaded,
        totalAnalyzed: data.total_analyzed,
        totalFailed: data.total_failed,
        totalShortlisted: data.total_shortlisted,
        threshold: data.threshold,
        completedAt: new Date().toLocaleString(),
      });

    } catch (err) {
      console.error("Analysis error:", err);

      if (err.name === "AbortError") {
        setError(
          "Analysis exceeded 10 minutes. Check the backend terminal for errors and try again."
        );
      } else {
        setError(err.message || "Unable to connect to the analysis server.");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  // Select or deselect an eligible candidate.
  const toggleCandidate = (candidate) => {
    if (candidate.score < threshold) return;

    setSelectedCandidates((previous) =>
      previous.includes(candidate.file)
        ? previous.filter((name) => name !== candidate.file)
        : [...previous, candidate.file]
    );
  };

  const selectAllShortlisted = () => {
    if (
      selectedCandidates.length === shortlisted.length &&
      shortlisted.length > 0
    ) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(
        shortlisted.map((candidate) => candidate.file)
      );
    }
  };

  // Download only the selected candidates' original resumes.
  const downloadSelectedResumes = async () => {
    if (!selectedCandidates.length) return;

    setDownloading(true);
    setError("");

    try {
      const zip = new JSZip();
      const usedNames = new Set();

      selectedCandidates.forEach((candidateName) => {
        const candidate = results.find(
          (item) => item.file === candidateName
        );

        if (!candidate || candidate.score < threshold) return;

        const originalFile = files.find(
          (file) => file.name === candidate.file
        );

        if (!originalFile) return;

        let zipName = originalFile.name;
        let counter = 1;

        while (usedNames.has(zipName)) {
          const dotIndex = originalFile.name.lastIndexOf(".");
          const base =
            dotIndex > -1
              ? originalFile.name.slice(0, dotIndex)
              : originalFile.name;
          const extension =
            dotIndex > -1
              ? originalFile.name.slice(dotIndex)
              : "";

          zipName = `${base}_${counter}${extension}`;
          counter++;
        }

        usedNames.add(zipName);
        zip.file(zipName, originalFile);
      });

      if (usedNames.size === 0) {
        throw new Error(
          "Original resume files are unavailable. Please upload them again."
        );
      }

      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 5 },
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "ResumeAI_Selected_Candidates.zip";

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);

    } catch (err) {
      setError(err.message || "Unable to create the ZIP file.");
    } finally {
      setDownloading(false);
    }
  };

  const getScoreClass = (score) => {
    if (score >= 75) return "score-strong";
    if (score >= threshold) return "score-good";
    return "score-low";
  };

  const renderCandidate = (candidate, index) => {
    const isShortlisted = candidate.score >= threshold;
    const isSelected = selectedCandidates.includes(candidate.file);
    const isExpanded = expandedCandidate === candidate.file;

    const matchedRequired =
      candidate.match?.matched_required || [];

    const matchedPreferred =
      candidate.match?.matched_preferred || [];

    const missingRequired =
      candidate.missing_required || [];

    return (
      <article className="candidate-card" key={`${candidate.file}-${index}`}>
        <div className="candidate-main">
          <label
            className={`candidate-checkbox ${!isShortlisted ? "checkbox-disabled" : ""
              }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={!isShortlisted}
              onChange={() => toggleCandidate(candidate)}
            />
            <span className="custom-check" />
          </label>

          <div className="candidate-avatar">
            {(candidate.resume?.full_name || candidate.file || "?")
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="candidate-info">
            <h3>
              {candidate.resume?.full_name || candidate.file}
            </h3>

            <p>
              {candidate.resume?.email || "Email not available"}
              {candidate.resume?.location
                ? ` · ${candidate.resume.location}`
                : ""}
            </p>

            <div className="candidate-tags">
              <span>
                {candidate.resume?.total_years_experience ?? "N/A"} years
                experience
              </span>
              <span>{candidate.file}</span>
            </div>
          </div>

          <div className="candidate-score">
            <strong className={getScoreClass(candidate.score)}>
              {candidate.score}%
            </strong>
            <span>Match score</span>
          </div>

          <div
            className={`candidate-status ${isShortlisted ? "status-shortlisted" : "status-rejected"
              }`}
          >
            {isShortlisted ? "Shortlisted" : "Below cutoff"}
          </div>

          <button
            className="expand-button"
            onClick={() =>
              setExpandedCandidate(isExpanded ? null : candidate.file)
            }
            aria-label="View candidate analysis"
          >
            {isExpanded ? (
              <ChevronUp size={19} />
            ) : (
              <ChevronDown size={19} />
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="candidate-details">
            <div className="analysis-reason">
              <Sparkles size={17} />
              <div>
                <strong>AI Analysis</strong>
                <p>
                  {candidate.match?.reasoning ||
                    "No additional explanation was returned."}
                </p>
              </div>
            </div>

            <div className="skill-columns">
              <div>
                <h4>
                  <CheckCircle2 size={16} />
                  Matched required skills
                </h4>

                {matchedRequired.length ? (
                  <div className="skill-list">
                    {matchedRequired.map((skill) => (
                      <span className="skill matched" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="detail-muted">No matched skills found.</p>
                )}
              </div>

              <div>
                <h4>
                  <CheckCircle2 size={16} />
                  Matched preferred skills
                </h4>

                {matchedPreferred.length ? (
                  <div className="skill-list">
                    {matchedPreferred.map((skill) => (
                      <span className="skill matched" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="detail-muted">No preferred skills matched.</p>
                )}
              </div>

              <div>
                <h4>
                  <AlertCircle size={16} />
                  Missing required skills
                </h4>

                {missingRequired.length ? (
                  <div className="skill-list">
                    {missingRequired.map((skill) => (
                      <span className="skill missing" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="detail-muted">
                    No missing required skills reported.
                  </p>
                )}
              </div>
            </div>

            {candidate.resume?.summary && (
              <div className="resume-summary">
                <h4>Resume summary</h4>
                <p>{candidate.resume.summary}</p>
              </div>
            )}

            {candidate.resume?.skills?.length > 0 && (
              <div className="resume-summary">
                <h4>Extracted skills</h4>
                <div className="skill-list">
                  {candidate.resume.skills.map((skill) => (
                    <span className="skill" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="resume-app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <BrainCircuit size={22} />
          </div>
          <span>TalentIQ</span>
        </div>

        <div className="header-right">
          <span className="secure-label">
            <span className="online-dot" />
            AI-powered screening
          </span>
          <button
            className="theme-toggle"
            onClick={() => setDarkMode(prev => !prev)}
            aria-label="Toggle theme"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="hr-avatar">HR</div>
        </div>
      </header>

      <main className="workspace">

        {/* Main heading */}
        <section className="intro">
          <div className="intro-icon">
            <Sparkles size={20} />
          </div>

          <h1>Find your next great hire.</h1>

          <p>
            Add a job description, upload resumes, and let AI
            identify the candidates who match your requirements.
          </p>
        </section>

        {/* Job description */}
        <section className="input-section">
          <div className="section-title">
            <div className="section-icon">
              <BriefcaseBusiness size={19} />
            </div>

            <div>
              <h2>Job description</h2>
              <p>What role are you hiring for?</p>
            </div>
          </div>

          <textarea
            className="jd-input"
            value={jd}
            onChange={(event) => setJd(event.target.value)}
            placeholder="Paste the job title, responsibilities, required skills, experience and qualifications here..."
            rows={7}
            disabled={loading}
          />

          <div className="input-footer">
            <span>{jd.trim().length} characters</span>
            <span>Include required and preferred skills for better matching</span>
          </div>
        </section>

        {/* Resume uploader */}
        <section className="input-section">
          <div className="section-title">
            <div className="section-icon">
              <UploadCloud size={19} />
            </div>

            <div>
              <h2>Candidate resumes</h2>
              <p>Upload resumes you want to evaluate.</p>
            </div>

            <span className="file-count">
              {files.length} {files.length === 1 ? "file" : "files"}
            </span>
          </div>

          <div
            className={`upload-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !loading && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (
                !loading &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <div className="upload-icon">
              <UploadCloud size={26} />
            </div>

            <strong>Drop your resumes here</strong>
            <p>or click to browse files</p>

            <span className="file-formats">
              PDF, DOCX and TXT · Maximum 10 MB per file
            </span>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleFiles}
              hidden
              disabled={loading}
            />
          </div>

          {files.length > 0 && (
            <div className="uploaded-files">
              <div className="uploaded-files-heading">
                <strong>Uploaded files</strong>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  disabled={loading}
                >
                  Remove all
                </button>
              </div>

              <div className="file-grid">
                {files.map((file, index) => (
                  <div
                    className="uploaded-file"
                    key={`${file.name}-${file.lastModified}-${index}`}
                  >
                    <FileText size={19} />

                    <div className="uploaded-file-info">
                      <strong title={file.name}>{file.name}</strong>
                      <span>
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={loading}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="settings-section">
          <div>
            <h3>Shortlisting threshold</h3>
            <p>
              Candidates scoring at or above this percentage will be shortlisted.
            </p>
          </div>

          <div className="threshold-control">
            <strong>{threshold}%</strong>

            <input
              type="range"
              min="0"
              max="100"
              value={threshold}
              onChange={(event) =>
                setThreshold(Number(event.target.value))
              }
              disabled={loading}
            />
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="error-message">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Analyze action */}
        <button
          className="analyze-button"
          onClick={analyzeResumes}
          disabled={loading || !jd.trim() || files.length === 0}
        >
          {loading ? (
            <>
              <LoaderCircle className="spin" size={19} />
              Analyzing resumes...
              <span className="elapsed-time">
                {formatTime(elapsed)}
              </span>
            </>
          ) : (
            <>
              <Sparkles size={19} />
              Analyze candidates
              <ArrowUpRight size={19} />
            </>
          )}
        </button>

        {loading && (
          <div className="processing-message">
            <LoaderCircle className="spin" size={16} />
            AI is reviewing resumes one by one. This can take several minutes.
            Your files are being processed.
          </div>
        )}

        {/* Results */}
        {analysisInfo && (
          <section className="results-section">
            <div className="results-heading">
              <div>
                <div className="results-eyebrow">
                  <CheckCircle2 size={16} />
                  Analysis completed
                </div>

                <h2>Candidate results</h2>

                <p>
                  Review the AI assessment and choose candidates to download.
                </p>
              </div>

              <button
                className="secondary-button"
                onClick={resetAnalysis}
              >
                <RotateCcw size={16} />
                Clear results
              </button>
            </div>

            <div className="result-stats">
              <div className="result-stat">
                <span>Total uploaded</span>
                <strong>{analysisInfo.totalUploaded}</strong>
              </div>

              <div className="result-stat">
                <span>Analyzed</span>
                <strong>{analysisInfo.totalAnalyzed}</strong>
              </div>

              <div className="result-stat">
                <span>Shortlisted</span>
                <strong className="stat-highlight">
                  {analysisInfo.totalShortlisted}
                </strong>
              </div>

              <div className="result-stat">
                <span>Failed</span>
                <strong>{analysisInfo.totalFailed}</strong>
              </div>
            </div>

            {shortlisted.length > 0 && (
              <div className="selection-toolbar">
                <div>
                  <strong>
                    {selectedCount} selected
                  </strong>
                  <span>
                    {" "}of {shortlisted.length} shortlisted candidates
                  </span>
                </div>

                <div className="selection-actions">
                  <button
                    className="select-all-button"
                    onClick={selectAllShortlisted}
                  >
                    {selectedCount === shortlisted.length
                      ? "Deselect all"
                      : "Select all shortlisted"}
                  </button>

                  <button
                    className="download-button"
                    onClick={downloadSelectedResumes}
                    disabled={selectedCount === 0 || downloading}
                  >
                    {downloading ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Download size={17} />
                    )}

                    {downloading
                      ? "Preparing ZIP..."
                      : `Download selected (${selectedCount})`}
                  </button>
                </div>
              </div>
            )}

            {results.length > 0 ? (
              <div className="candidate-list">
                {[...results]
                  .sort((a, b) => b.score - a.score)
                  .map((candidate, index) =>
                    renderCandidate(candidate, index)
                  )}
              </div>
            ) : (
              <div className="empty-results">
                <Users size={30} />
                <h3>No resumes could be analyzed</h3>
                <p>
                  Check the failed files below or try uploading readable resumes.
                </p>
              </div>
            )}

            {failedFiles.length > 0 && (
              <div className="failed-files">
                <h3>
                  <AlertCircle size={17} />
                  Files that could not be analyzed ({failedFiles.length})
                </h3>

                {failedFiles.map((file, index) => (
                  <div className="failed-file" key={`${file.file}-${index}`}>
                    <FileText size={17} />
                    <div>
                      <strong>{file.file}</strong>
                      <span>{file.error}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="results-disclaimer">
              AI-generated match scores are decision-support estimates.
              Review candidate information before making hiring decisions.
            </p>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <BrainCircuit size={16} />
        ResumeAI · AI-powered recruitment assistant
      </footer>
    </div>
  );
}

export default App;
