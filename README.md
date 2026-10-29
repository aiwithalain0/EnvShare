# EnvShare 🔐

**Secure environment-variable management for development teams.**

EnvShare helps teams manage project environment variables and sensitive configuration values in one place, instead of sharing `.env` files through messaging apps or other insecure channels.

It provides authenticated access, encrypted secret storage, environment management, `.env` import and preview, controlled secret visibility, and audit history.

**Live Demo:** [Frontend](https://envshare-frontend-one.vercel.app/)
**Repository:** [aiwithalain0/EnvShare](https://github.com/aiwithalain0/EnvShare)

---

## 📌 Table of Contents

- [Why EnvShare?](#-why-envshare)
- [Features](#-features)
- [How It Works](#-how-it-works)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Overview](#-api-overview)
- [Security](#-security)
- [Deployment](#-deployment)
- [Current Limitations](#-current-limitations)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Author](#-author)
- [License](#-license)

## 🚨 Why EnvShare?

Development teams regularly work with sensitive configuration values, including:

- API keys and access tokens
- Database connection strings
- Application secrets
- Service URLs and configuration settings
- Development, staging, and production variables

Sharing these values through chat messages or committing `.env` files to Git can expose sensitive information.

EnvShare aims to make sharing and managing environment configuration safer by providing a centralized, authenticated workspace for team projects.

## ✨ Features

### 🔑 Authentication
- User registration and login.
- Password hashing.
- Token-based authentication for protected API endpoints.

### 📁 Project Management
- Create projects.
- View projects accessible to the authenticated user.
- Associate project membership with access to project resources.

### 🌍 Environment Management
- Organize variables into environments.
- Create and list environments belonging to a project.
- Keep configuration values organized by application environment.

### 🔐 Variable Management
- Create, update, and delete environment variables.
- Mask sensitive values in normal API responses.
- Reveal values through dedicated API operations.
- Copy configuration values when needed.
- View variable history where supported.

### 📥 `.env` Import
- Import configuration from `.env` content.
- Preview parsed variables before importing.
- Detect duplicate keys and existing-variable conflicts.
- Review new, changed, unchanged, and restored variable counts where applicable.
- Confirm imports before committing changes.

### 📤 Export
- Export environment configuration in supported formats.
- Generate `.env` output and JSON output from the frontend.
- Avoid silently exporting incomplete configuration when a secret cannot be retrieved.

### 🧾 Audit History
- Record supported project and variable-related events.
- Review project audit logs.
- Avoid placing secret values in audit-log entries.

> Feature availability and permissions depend on the implemented API endpoints and current authorization rules. See [Current Limitations](#-current-limitations).

## 🔄 How It Works

1. **Create an account** and sign in.
2. **Create a project** to organize an application's configuration.
3. **Create an environment** for the relevant configuration.
4. **Add or import variables** into that environment.
5. **Preview changes** before confirming an import.
6. **Access or export values** when needed through the supported application workflows.
7. **Review audit history** to inspect recorded project activity.

The goal is to keep configuration management organized without routinely distributing raw `.env` files through chat applications.

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Backend API | Python, FastAPI |
| Database access | SQLAlchemy 2.0 |
| Data validation | Pydantic v2 |
| Database | SQLite for local development; PostgreSQL/Neon for production |
| Authentication | Password hashing, JWT bearer tokens |
| Secret encryption | Python `cryptography` library, Fernet |
| Frontend | HTML, CSS, vanilla JavaScript |
| Frontend API communication | JavaScript `fetch` |
| Frontend deployment | Vercel |
| Backend deployment | Vercel |
| Version control | Git and GitHub |

## 🏗️ Architecture

```text
                 ┌─────────────────────────┐
                 │       Web Browser       │
                 │  HTML / CSS / JavaScript│
                 └────────────┬────────────┘
                              │ HTTP requests
                              ▼
                 ┌─────────────────────────┐
                 │       FastAPI API       │
                 │ Authentication & Routes │
                 └────────────┬────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       ┌──────────────────┐     ┌──────────────────┐
       │   SQLAlchemy     │     │ Secret Encryption│
       │   Data Access    │     │  Fernet          │
       └────────┬─────────┘     └──────────────────┘
                │
                ▼
       ┌──────────────────┐
       │   PostgreSQL     │
       │   Neon (prod)    │
       └──────────────────┘
```

The backend validates requests, applies authentication and authorization checks, handles database operations, and protects stored secret values through encryption.

## 📂 Project Structure

The repository is organized around a Python backend and a separate static frontend.

```text
EnvShare/
├── backend/
│   ├── main.py
│   ├── variable_routes.py
│   ├── auth_routes.py
│   ├── project_routes.py
│   ├── environment_routes.py
│   ├── models.py
│   ├── database.py
│   └── ...
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── api.js
│       └── views/
│           ├── importExport.js
│           └── variables.js
├── .gitignore
├── README.md
└── ...
```

*Note: This is a representative overview. Some filenames and directories may differ from the current repository.*

## 🚀 Getting Started

### Prerequisites

Install the following:

- Python 3.12 or a compatible supported Python version
- Git
- A web browser
- PostgreSQL, or a Neon PostgreSQL database for production-like testing

### 1. Clone the repository

```bash
git clone https://github.com/aiwithalain0/EnvShare.git
cd EnvShare
```

### 2. Create a Python virtual environment

From the repository root:

**Windows PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks virtual-environment activation, you can run the environment's Python executable directly instead.

### 3. Install backend dependencies

Check the backend directory for its dependency file. If `requirements.txt` exists, run:

```powershell
python -m pip install -r .\backend\requirements.txt
```

If the dependency file has a different name or location, use the one present in the repository.

### 4. Configure environment variables

Create the appropriate local environment configuration for the backend. Never commit real credentials or production secrets.

At minimum, configure the database connection, authentication signing secret, and encryption key according to the backend's settings.

See [Environment Variables](#-environment-variables).

### 5. Start the backend

Open PowerShell in the repository root:

```powershell
Set-Location .\backend
python -m uvicorn main:app --reload
```

If Uvicorn is not installed, install the project's declared backend dependencies first.

The API will typically be available at:

- API base URL: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`
- OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

These addresses assume the default Uvicorn configuration.

### 6. Start the frontend

Serve the `frontend` directory using a local static web server or the development method configured in the repository.

For example, if Python is available, open another PowerShell window at the repository root and run:

```powershell
python -m http.server 5500 --directory frontend
```

Open:

`http://localhost:5500`

Ensure the frontend API base URL points to your local backend and that the backend CORS configuration allows the frontend's local origin.

## 🔧 Environment Variables

The application needs environment-specific configuration. The precise variable names depend on the settings implemented in the backend.

| Configuration | Purpose |
|---|---|
| `DATABASE_URL` | Database connection string; use PostgreSQL/Neon for production |
| JWT signing secret | Signs authentication tokens |
| Fernet encryption key | Encrypts and decrypts stored secret values |
| CORS allowed origins | Controls which frontend origins may call the API |

Use the exact variable names expected by the current backend settings module. Do not assume that the descriptive labels in this table are literal environment-variable names.

### Important security rules

- Never commit `.env` files containing real credentials.
- Never publish database connection strings, JWT signing secrets, or encryption keys.
- Keep production environment variables in the deployment platform's environment settings.
- Use separate secrets for local development and production.
- Back up the encryption key securely. Losing it may make encrypted database values unrecoverable.
- Restrict access to production credentials.

## 🔌 API Overview

The backend exposes REST endpoints for authentication, projects, environments, variables, imports, and audit history.

| Area | Supported operations |
|---|---|
| Authentication | `POST /auth/register`, `POST /auth/login` |
| Projects | `POST /projects`, `GET /projects` |
| Project audit history | `GET /projects/{project_id}/audit-logs` |
| Environments | Create and list environments under a project |
| Variables | Create, read, update, delete, reveal, and access history through supported routes |
| Imports | Preview `.env` content and confirm imports through supported routes |

For the exact endpoint paths, request bodies, response formats, and authentication requirements, run the backend and visit `/docs`.

Protected endpoints require the appropriate authentication token. Do not expose sensitive values in public logs, screenshots, or example requests.

## 🛡️ Security

EnvShare is designed around several security practices:

- **Password hashing:** Passwords are hashed rather than stored as plain text.
- **Token authentication:** Protected API operations use bearer-token authentication.
- **Encrypted storage:** Sensitive variable values are encrypted before database storage.
- **Masked responses:** Normal variable responses avoid returning raw secret values.
- **Controlled reveal:** Secret retrieval uses dedicated application operations.
- **Import confirmation:** Imported configuration can be previewed before changes are committed.
- **Audit events:** Supported actions can be recorded without embedding secret values in audit logs.
- **Secret hygiene:** Production credentials should be managed outside version control.

Security note: Encryption and authentication do not automatically guarantee that every route is secure. Authorization enforcement, rate limiting, key management, deployment configuration, and security testing must be reviewed as the application evolves.

## ☁️ Deployment

EnvShare's current deployment uses Vercel for the frontend and backend, with Neon PostgreSQL for the production database.

- **Frontend:** [envshare-frontend-one.vercel.app](https://envshare-frontend-one.vercel.app/)
- **Database:** PostgreSQL hosted by Neon

### Deployment checklist

1. Push the intended changes to the `main` branch.
2. Confirm the deployment platform builds the latest commit successfully.
3. Configure `DATABASE_URL` with the production PostgreSQL connection string.
4. Configure the backend's authentication and encryption secrets.
5. Set the correct frontend API base URL.
6. Verify CORS settings for the deployed frontend.
7. Test registration, login, project creation, variable operations, and imports.
8. Confirm that encrypted values persist correctly in the production database.
9. Check deployment logs for errors without exposing credentials.

A successful Git push does not, by itself, guarantee that production deployment or runtime checks have succeeded.

## ⚠️ Current Limitations

EnvShare is an evolving project. The following areas need verification or further implementation before the application should be treated as production-ready:

- Invitation-code generation, joining, expiration, and revocation workflows.
- Complete role-based permissions for owners, managers, and team members.
- Comprehensive authorization checks on every sensitive endpoint.
- Secure environment export and complete secret-retrieval workflows.
- Import overwrite behavior and robust variable rollback/version management.
- Rate limiting for authentication and secret-reveal operations.
- Production hardening, automated security testing, and deployment monitoring.

Do not rely on role labels or project membership alone as proof that all permissions are enforced.

## 🗺️ Roadmap

Planned improvements include:

- [ ] Team invitations and project membership management.
- [ ] Enforced role-based access control.
- [ ] More complete environment export and import workflows.
- [ ] Improved variable versioning and rollback.
- [ ] Rate limiting and additional security protections.
- [ ] Expanded automated tests and CI checks.
- [ ] Improved deployment monitoring and operational documentation.
- [ ] A polished dashboard for managing team configuration.

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes.
4. Test the affected functionality.
5. Open a pull request describing the changes.

For security vulnerabilities, avoid publishing working credentials, secret values, or exploit details in a public issue.

## 👨‍💻 Author

**Syed Adil Hussain**  
Junior AI Engineer | Generative AI | Python | Backend Development

- GitHub: [@aiwithalain0](https://github.com/aiwithalain0)
- LinkedIn: [Syed Adil Hussain](https://www.linkedin.com/in/syedadil062/)

## 📄 License

No license is specified here. Before using, distributing, or modifying this project, check the repository for an existing license. If there is none, choose and add an appropriate license before describing the project as open source.

---

<p align="center">
  Built to make team configuration management safer and more organized.
</p>
