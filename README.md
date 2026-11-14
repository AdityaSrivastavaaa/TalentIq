# TalentIQ – AI-Powered Resume Screening Platform 🚀

<p align="center">
  <strong>Smarter Hiring. Better Talent. Faster Decisions.</strong>
</p>

<p align="center">
  An AI-powered resume screening platform that analyzes resumes against job descriptions, evaluates candidate suitability, and helps recruiters identify the right talent faster.
</p>

<p align="center">
  <a href="https://talentiq-silk.vercel.app/">🌐 Live Demo</a>
</p>

---

## 📌 About the Project

TalentIQ is an AI-powered recruitment assistant designed to simplify and improve the resume screening process.

Recruiters often receive hundreds of resumes for a single job opening. Manually reviewing each resume can be time-consuming and inefficient.

TalentIQ addresses this challenge by allowing recruiters to upload multiple resumes, provide a job description, and use AI-powered analysis to evaluate and rank candidates based on their suitability for the role.

This project is my first practical AI/ML project as I expand my development experience beyond the MERN stack and explore Artificial Intelligence and Large Language Models.

## ✨ Key Features

- **Multiple Resume Upload:** Upload and analyze multiple candidate resumes at once.
- **AI-Powered Screening:** Evaluate resumes against a given job description.
- **Candidate Matching Scores:** Generate matching scores to help compare candidates.
- **Skill Analysis:** Identify relevant skills and qualifications.
- **Candidate Classification:** Categorize candidates based on their matching scores.
- **Shortlisting:** Select and manage suitable candidates.
- **Resume Download:** Download selected candidates' original resumes as a ZIP file.
- **Light & Dark Mode:** Switch between themes for a comfortable experience.
- **Responsive Interface:** Clean and user-friendly application interface.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| React.js | Frontend development |
| Vite | Frontend build tool |
| Python | Backend development |
| FastAPI | REST API development |
| Groq API | LLM-powered analysis |
| Large Language Models | Resume and job description analysis |
| Pydantic | Data validation |
| PyPDF | PDF text extraction |
| python-docx | DOCX text extraction |
| JSZip | Download shortlisted resumes |
| Vercel | Frontend deployment |
| Render | Backend deployment |
| Git & GitHub | Version control |

## ⚙️ How It Works

1. Recruiter enters a job description.
2. Recruiter uploads multiple resumes in supported formats.
3. Backend extracts text from uploaded resumes.
4. Job description and resume information are processed for analysis.
5. AI evaluates candidate relevance and suitability.
6. Matching scores and candidate results are displayed.
7. Recruiter reviews and shortlists suitable candidates.
8. Selected original resumes can be downloaded as a ZIP file.

## 📊 Candidate Scoring

TalentIQ evaluates candidates using three main factors:

| Evaluation Factor | Weight |
|---|---:|
| Required Skills | 60% |
| Preferred Skills | 15% |
| Relevant Experience | 25% |

The scoring system uses available evaluation factors and normalizes the score when some factors are not present.

Candidates are classified into three categories:

- **Strong Match:** Score of 75% or above.
- **Possible Match:** Score between 50% and 74%.
- **Weak Match:** Score below 50%.

*Note: Matching scores are decision-support signals, not definitive measures of candidate ability. Recruiters should review original resumes and make final hiring decisions themselves.*

## 📂 Project Structure

```text
TalentIq/
│
├── api.py
├── resume_parser.py
├── requirements.txt
├── .gitignore
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

## 💻 Installation & Setup

Follow these steps to run TalentIQ locally.

### Prerequisites

Make sure you have installed:

- Python 3.10+
- Node.js and npm
- Git
- A Groq API key

### 1. Clone the Repository

```bash
git clone https://github.com/AdityaSrivastavaaa/TalentIq.git

cd TalentIq
```

### 2. Set Up the Backend

Create and activate a virtual environment.

**Windows PowerShell:**

```powershell
python -m venv .venv

.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
```

Get your API key from:

https://console.groq.com/keys

Never commit your `.env` file or expose your API key publicly.

### 4. Start the Backend

```powershell
python -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

Backend URL:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

### 5. Set Up the Frontend

Open another terminal:

```powershell
cd frontend
npm install
```

Create a `.env` file inside the `frontend` folder:

```env
VITE_API_URL=http://127.0.0.1:8000
```

### 6. Start the Frontend

```powershell
npm run dev
```

Open the application:

```text
http://localhost:5173
```

## 🌐 Live Deployment

TalentIQ is deployed using:

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Render |

**Live Application:**  
https://talentiq-silk.vercel.app/

## 🔐 Security & Privacy

- Groq API credentials are stored in backend environment variables.
- API keys are not exposed in frontend code.
- Uploaded resumes are processed by the backend.
- Temporary uploaded resume files are removed after request processing.

Avoid uploading real candidate information without appropriate authorization and privacy safeguards.

## 🚀 Future Improvements

Some features I would like to explore in future versions:

- Advanced candidate comparison.
- More detailed skill-gap analysis.
- Resume parsing with improved information extraction.
- Candidate analytics and reporting.
- Support for additional resume formats.
- Improved evaluation accuracy and explainability.
- User authentication and recruiter-specific workspaces.

## 🎯 Learning Outcomes

Through this project, I explored:

- Integrating Large Language Models into real-world applications.
- Working with Groq API.
- Building Python backend APIs using FastAPI.
- Extracting and processing resume documents.
- Connecting React frontend applications with Python backends.
- Designing AI-powered candidate evaluation workflows.
- Deploying full-stack applications using Vercel and Render.

## 🙌 Acknowledgements

A special thanks to **Padho with Pratyush** and **Pratyush** for being part of my AI learning journey and helping me explore Artificial Intelligence and practical AI development.

This project represents an important first step in my journey of learning and building with AI.

## 👨‍💻 Author

**Aditya Srivastava**

- GitHub: [AdityaSrivastavaaa](https://github.com/AdityaSrivastavaaa)
- Project: [TalentIQ](https://talentiq-silk.vercel.app/)

---

<p align="center">
  ⭐ If you find this project interesting, consider giving it a star!
</p>

<p align="center">
  Built with curiosity, code, and a passion for AI. ❤️
</p>
