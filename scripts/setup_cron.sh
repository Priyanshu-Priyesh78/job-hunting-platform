#!/usr/bin/env bash
# macOS launchd automated 6-hour job runner for Job Hunter Bot

PLIST_NAME="com.priyanshu.jobhunter"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
PROJECT_DIR="/Users/mac/.gemini/antigravity/scratch/job-hunting-bot"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

echo "Setting up automated 6-hour scanner schedule..."

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${PROJECT_DIR}/node_modules/.bin/tsx</string>
        <string>${PROJECT_DIR}/src/cli/index.ts</string>
        <string>scan</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>StartInterval</key>
    <integer>21600</integer> <!-- 21600 seconds = 6 hours -->
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/scheduler.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/scheduler.stderr.log</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ 6-Hour Automated Scanner installed successfully via macOS LaunchAgent!"
echo "Logs will be written to: $LOG_DIR/scheduler.stdout.log"
echo "To disable, run: launchctl unload $PLIST_PATH"

