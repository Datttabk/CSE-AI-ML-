FROM python:3.11-slim

WORKDIR /workspace

# Install system dependencies needed for Playwright and building tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browser and dependencies
RUN playwright install chromium
RUN playwright install-deps chromium

COPY app /workspace/app
COPY VTU_Results_All.csv /workspace/

EXPOSE 8000

ENV PORT=8000
ENV DATABASE_URL=sqlite:////workspace/eduinsight.db
ENV PLAYWRIGHT_HEADLESS=True

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
