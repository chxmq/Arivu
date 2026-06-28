# Arivu — run the whole system with a single command.
# Usage:  make            (starts everything; Ctrl+C stops it all)
SHELL := /bin/bash

HUB_DIR   := arivu-web-hub
APP_DIR   := arivu-mobile-app
SITE_PORT := 8765

.PHONY: start all hub site app seed install stop help

# Default target: hub API + command center + mobile app, all at once.
start all:
	@echo "▶ Arivu — hub :8787 · command center :$(SITE_PORT) · expo :8081"
	@echo "  Press Ctrl+C once to stop everything."
	@trap 'kill 0' INT TERM EXIT; \
	node $(HUB_DIR)/server/hub.mjs & \
	npx -y serve $(HUB_DIR) -l $(SITE_PORT) & \
	cd $(APP_DIR) && npm start

# Hub API server only — http://localhost:8787
hub:
	node $(HUB_DIR)/server/hub.mjs

# Command center static site only — http://localhost:$(SITE_PORT)
site:
	npx -y serve $(HUB_DIR) -l $(SITE_PORT)

# Mobile app (Expo / Metro) only
app:
	cd $(APP_DIR) && npm start

# Seed the hub corpus with demo entries (WARNING: resets the corpus)
seed:
	node $(HUB_DIR)/scripts/seed-demos.mjs

# Install dependencies for the mobile app and the LoRa gateway
install:
	cd $(APP_DIR) && npm install
	cd $(HUB_DIR) && npm install

# Free the ports if a previous run got stuck
stop:
	-@lsof -ti tcp:8787 tcp:$(SITE_PORT) tcp:8081 2>/dev/null | xargs kill 2>/dev/null || true
	@echo "Freed ports 8787 / $(SITE_PORT) / 8081"

help:
	@echo "Arivu make targets:"
	@echo "  make            Run hub + command center + app together"
	@echo "  make hub        Run only the hub API (:8787)"
	@echo "  make site       Run only the command center (:$(SITE_PORT))"
	@echo "  make app        Run only the Expo mobile app (:8081)"
	@echo "  make seed       Seed demo corpus (resets corpus)"
	@echo "  make install    Install app + gateway dependencies"
	@echo "  make stop       Kill anything stuck on the ports"
