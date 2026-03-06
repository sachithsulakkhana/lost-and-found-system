FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir flask flask-cors pandas numpy scikit-learn joblib pytz && \
    pip install --no-cache-dir -r requirements.txt || true

# Copy source, excluding venv and cache (handled by .dockerignore)
COPY . .

# Train model if not already present
RUN mkdir -p models && \
    if [ ! -f models/risk_model.pkl ]; then \
        python train_simple.py && echo "Model trained successfully"; \
    else \
        echo "Model already present, skipping training"; \
    fi

EXPOSE 5001
CMD ["python", "app.py"]
