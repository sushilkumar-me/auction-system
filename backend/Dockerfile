FROM python:3.11-slim

WORKDIR /app

# Copy backend
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .

# Run
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT