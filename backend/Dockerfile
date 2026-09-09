FROM python:3.12-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install runtime deps without heavy optional torch wheels for faster Azure pulls.
# Recognition falls back to OpenCV when torch is absent.
RUN grep -vE '^(torch|torchvision)' requirements.txt > /tmp/requirements.prod.txt \
    && pip install --no-cache-dir -r /tmp/requirements.prod.txt

COPY app ./app
ENV MEDIA_ROOT=/data/media
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
