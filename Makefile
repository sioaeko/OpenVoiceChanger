.PHONY: dev-backend dev-frontend dev install build docker docker-gpu clean

dev-backend:
	PYTHONPATH=. uvicorn backend.main:app --reload

dev-frontend:
	cd frontend && npm run dev

dev:
	$(MAKE) dev-backend & $(MAKE) dev-frontend & wait

install:
	pip install -r backend/requirements.txt
	cd frontend && npm install

build:
	cd frontend && npm run build

docker:
	docker compose up --build

docker-gpu:
	docker compose --profile gpu up --build

clean:
	rm -rf frontend/node_modules frontend/dist __pycache__ backend/__pycache__
