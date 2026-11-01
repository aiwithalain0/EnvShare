# EnvShare

EnvShare is a team environment-variable management application. It helps development teams securely manage, organize, and share `.env` files without exchanging secrets through messaging platforms.

## Features

- User registration and authentication
- Project and team management
- Team invitations and role-based access
- Multiple environments per project
- Encrypted environment-file storage
- Whole-file version history
- File comparison and change tracking
- Restore previous file versions
- Sensitive-value masking in the interface
- Audit logging
- Copy environment-file contents when authorized

## Technology Stack

### Backend
- Python 3.12
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- SQLite for local development
- PostgreSQL support
- JWT authentication
- Fernet encryption

### Frontend
- HTML
- CSS
- JavaScript

## Project Structure

```text
EnvShare/
├── backend/
│   ├── migrations/
│   ├── tests/
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── css/
│   ├── js/
│   ├── index.html
│   └── vercel.json
├── .gitignore
├── README.md
└── render.yaml
```

## Requirements

- Python 3.12
- Git
- A modern web browser

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/aiwithalain0/EnvShare.git
cd EnvShare
```

### 2. Create a Python virtual environment

```powershell
cd backend
py -3.12 -m venv .venv
```

Activate it on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

On macOS or Linux:

```bash
source .venv/bin/activate
```

### 3. Install backend dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Configure environment variables

Copy the example configuration:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

Generate a secure application secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Generate a Fernet encryption key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Open `backend/.env` and replace the placeholders with the generated values:

```dotenv
DATABASE_URL=

SECRET_KEY=your_generated_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
REFRESH_COOKIE_SECURE=false

ENCRYPTION_KEY=your_generated_fernet_key
```

Keep these values private. Never commit your `.env` file or share your encryption key.

When `DATABASE_URL` is empty, EnvShare uses a local SQLite database.

For PostgreSQL, provide a valid PostgreSQL connection URL.

### 5. Apply database migrations

Run from the `backend` directory:

```bash
python -m alembic upgrade head
```

### 6. Start the backend

Run from the `backend` directory:

```bash
python -m uvicorn main:app --reload
```

Backend API:

http://127.0.0.1:8000

API documentation:

http://127.0.0.1:8000/docs

Health check:

http://127.0.0.1:8000/health

### 7. Start the frontend

Open another terminal at the repository root:

```powershell
cd frontend
py -3.12 -m http.server 5500
```

Open the application:

http://localhost:5500

Keep both frontend and backend servers running while using the local application.

## Running Tests

Open a terminal in the `backend` directory, activate the virtual environment, and run:

```bash
python -m pytest -v
```

## Database Migrations

Apply pending migrations:

```bash
python -m alembic upgrade head
```

View migration history:

```bash
python -m alembic history
```

View the current database revision:

```bash
python -m alembic current
```

## Security

- Environment values are encrypted before storage.
- Authentication uses JWT tokens.
- Access is controlled through project membership and roles.
- Sensitive values are masked in the interface.
- Audit events track relevant application activity.
- Secret keys and database files must remain outside version control.

Protect `SECRET_KEY`, `ENCRYPTION_KEY`, database credentials, and all environment-file contents.

## Deployment

The repository includes a `render.yaml` configuration for backend deployment and a Vercel configuration for the frontend.

Deployment requires correctly configured environment variables, database connectivity, and frontend API routing.

Never commit production secrets.

## License

See the repository for licensing information.
