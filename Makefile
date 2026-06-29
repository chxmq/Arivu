# Arivu — run the whole system with a single command.
# Usage:  make            (starts everything; Ctrl+C stops it all)
SHELL := /bin/bash

HUB_DIR   := arivu-web-hub
APP_DIR   := arivu-mobile-app
SITE_PORT := 8765

.PHONY: start all hub site app gateway seed install stop help

# Default target: hub + gateway + command center + mobile app, all at once.
start all:
	@echo "▶ Arivu — hub :8787 · gateway (ESP32 USB) · command center :$(SITE_PORT) · expo :8081"
	@echo "  Close Arduino Serial Monitor if the ESP32 port is busy."
	@echo "  Press Ctrl+C once to stop everything."
	@trap 'kill 0' INT TERM EXIT; \
	node $(HUB_DIR)/server/hub.mjs & \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
	  curl -sf http://localhost:8787/api/health >/dev/null 2>&1 && break; \
	  sleep 0.25; \
	done; \
	node $(HUB_DIR)/gateway.js & \
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

# ESP32 serial gateway only (forwards sentinel → hub live panels)
gateway:
	node $(HUB_DIR)/gateway.js

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
	-@pkill -f "$(HUB_DIR)/gateway.js" 2>/dev/null || true
	@echo "Freed ports 8787 / $(SITE_PORT) / 8081 and stopped gateway"

help:
	@echo "Arivu make targets:"
	@echo "  make            Run hub + ESP32 gateway + command center + app"
	@echo "  make hub        Run only the hub API (:8787)"
	@echo "  make gateway    Run only the ESP32 serial gateway"
	@echo "  make site       Run only the command center (:$(SITE_PORT))"
	@echo "  make app        Run only the Expo mobile app (:8081)"
	@echo "  make seed       Seed demo corpus (resets corpus)"
	@echo "  make install    Install app + gateway dependencies"
	@echo "  make stop       Kill anything stuck on the ports"
