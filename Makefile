.PHONY: dev-backend dev-frontend dev install install-test test test-backend test-frontend build clean

dev-backend:
	PYTHONPATH=. uvicorn backend.main:app --reload

dev-frontend:
	cd frontend && npm run dev

dev:
	$(MAKE) dev-backend & $(MAKE) dev-frontend & wait

install:
	pip install -r backend/requirements.txt
	pip install --no-deps git+https://github.com/RVC-Project/Retrieval-based-Voice-Conversion
	cd frontend && npm install

install-test:
	pip install -r backend/requirements-test.txt

test-backend:
	python -m pytest

test-frontend:
	cd frontend && npm test

test: test-backend test-frontend

build:
	cd frontend && npm run build

clean:
	rm -rf frontend/node_modules frontend/dist __pycache__ backend/__pycache__
