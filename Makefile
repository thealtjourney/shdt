.PHONY: help dev build up down restart migrate import seed logs backup restore test clean export-static

# Color output
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
NC := \033[0m # No Color

help:
	@echo "$(BLUE)SHDT Makefile Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Setup and Development$(NC)"
	@echo "  make dev          - Start development environment"
	@echo "  make build        - Build Docker images"
	@echo ""
	@echo "$(GREEN)Container Management$(NC)"
	@echo "  make up           - Start production containers"
	@echo "  make down         - Stop and remove containers"
	@echo "  make restart      - Restart all services"
	@echo ""
	@echo "$(GREEN)Database Operations$(NC)"
	@echo "  make migrate      - Run database migrations"
	@echo "  make import       - Import data from CSV files"
	@echo "  make seed         - Seed database with test data"
	@echo "  make backup       - Backup PostgreSQL database"
	@echo "  make restore      - Restore from backup (BACKUP_FILE=/path/to/file.sql)"
	@echo ""
	@echo "$(GREEN)Monitoring$(NC)"
	@echo "  make logs         - Show real-time logs for all services"
	@echo "  make test         - Run test suite"
	@echo ""
	@echo "$(GREEN)Maintenance$(NC)"
	@echo "  make clean        - Remove containers, volumes, and logs"
	@echo ""
	@echo "$(GREEN)Vercel demo snapshot$(NC)"
	@echo "  make export-static - Snapshot live backend to client/public/data/"
	@echo ""

# Export the live backend to the static JSON the Vercel frontend reads.
# Requires the backend to be running (default: http://localhost:8000).
export-static:
	@echo "$(BLUE)Exporting live backend to client/public/data/...$(NC)"
	@python3 scripts/export_static_data.py $(if $(API),--api $(API))
	@echo "$(GREEN)Done. Review the diff, commit, push — Vercel will redeploy.$(NC)"

# Development environment
dev:
	@echo "$(BLUE)Starting development environment...$(NC)"
	docker-compose -f docker-compose.yml up -d
	@echo "$(GREEN)Development environment started$(NC)"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend: http://localhost:8000"
	@echo "Database: localhost:5432"

# Build Docker images
build:
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker-compose -f docker-compose.prod.yml build --no-cache
	@echo "$(GREEN)Build complete$(NC)"

# Production environment
up:
	@echo "$(BLUE)Starting production environment...$(NC)"
	docker-compose -f docker-compose.prod.yml up -d
	@sleep 5
	@echo "$(GREEN)Services started$(NC)"
	@docker-compose -f docker-compose.prod.yml ps

down:
	@echo "$(BLUE)Stopping services...$(NC)"
	docker-compose -f docker-compose.prod.yml down
	@echo "$(GREEN)Services stopped$(NC)"

restart:
	@echo "$(BLUE)Restarting services...$(NC)"
	docker-compose -f docker-compose.prod.yml restart
	@echo "$(GREEN)Services restarted$(NC)"

# Database operations
migrate:
	@echo "$(BLUE)Running database migrations...$(NC)"
	docker-compose -f docker-compose.prod.yml exec -T backend \
		python -m alembic upgrade head
	@echo "$(GREEN)Migrations completed$(NC)"

import:
	@echo "$(BLUE)Importing data from CSV files...$(NC)"
	@if [ -z "$(CSV_PATH)" ]; then \
		echo "$(RED)Error: CSV_PATH not specified$(NC)"; \
		echo "Usage: make import CSV_PATH=/path/to/data.csv"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.prod.yml exec -T backend \
		python scripts/import_data.py $(CSV_PATH)
	@echo "$(GREEN)Data import completed$(NC)"

seed:
	@echo "$(BLUE)Seeding database with test data...$(NC)"
	docker-compose -f docker-compose.prod.yml exec -T backend \
		python scripts/seed_data.py
	@echo "$(GREEN)Database seeded$(NC)"

backup:
	@echo "$(BLUE)Backing up PostgreSQL database...$(NC)"
	@mkdir -p ./server/db/backup
	@BACKUP_FILE="./server/db/backup/shdt_$(shell date +%Y%m%d_%H%M%S).sql"; \
	docker-compose -f docker-compose.prod.yml exec -T postgres \
		pg_dump -U postgres shdt_db > $$BACKUP_FILE; \
	echo "$(GREEN)Backup created: $$BACKUP_FILE$(NC)"

restore:
	@echo "$(BLUE)Restoring database from backup...$(NC)"
	@if [ -z "$(BACKUP_FILE)" ]; then \
		echo "$(RED)Error: BACKUP_FILE not specified$(NC)"; \
		echo "Usage: make restore BACKUP_FILE=/path/to/backup.sql"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.prod.yml exec -T postgres \
		psql -U postgres shdt_db < $(BACKUP_FILE)
	@echo "$(GREEN)Database restored$(NC)"

# Monitoring
logs:
	@echo "$(BLUE)Streaming logs (Ctrl+C to stop)...$(NC)"
	docker-compose -f docker-compose.prod.yml logs -f

logs-backend:
	@docker-compose -f docker-compose.prod.yml logs -f backend

logs-postgres:
	@docker-compose -f docker-compose.prod.yml logs -f postgres

logs-nginx:
	@docker-compose -f docker-compose.prod.yml logs -f nginx

# Testing
test:
	@echo "$(BLUE)Running tests...$(NC)"
	docker-compose -f docker-compose.prod.yml exec -T backend pytest -v
	@echo "$(GREEN)Tests completed$(NC)"

test-backend:
	@docker-compose -f docker-compose.prod.yml exec -T backend pytest -v tests/

test-coverage:
	@docker-compose -f docker-compose.prod.yml exec -T backend \
		pytest --cov=app tests/

# Maintenance
clean:
	@echo "$(BLUE)Cleaning up...$(NC)"
	docker-compose -f docker-compose.prod.yml down -v
	docker system prune -f
	@echo "$(GREEN)Cleanup completed$(NC)"

ps:
	@docker-compose -f docker-compose.prod.yml ps

shell-backend:
	@docker-compose -f docker-compose.prod.yml exec backend /bin/bash

shell-postgres:
	@docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres shdt_db

# Status check
status:
	@echo "$(BLUE)Checking service health...$(NC)"
	@docker-compose -f docker-compose.prod.yml ps
	@echo ""
	@echo "$(BLUE)Backend health:$(NC)"
	@curl -s http://localhost:8000/health || echo "$(RED)Backend unavailable$(NC)"
	@echo ""
	@echo "$(BLUE)Frontend health:$(NC)"
	@curl -s http://localhost/ || echo "$(RED)Frontend unavailable$(NC)"
	@echo ""

# Documentation
docs:
	@echo "$(GREEN)Documentation:$(NC)"
	@echo "  - ARCHITECTURE.md: System design and components"
	@echo "  - DEPLOYMENT.md:   Production deployment guide"
	@echo "  - DATA_GUIDE.md:   Data import and format specification"
	@echo "  - USER_GUIDE.md:   End-user feature documentation"
