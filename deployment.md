How to set this up as a server:
Create a unit file, e.g. /etc/systemd/system/office-climate.service:

```ini
[Unit]
Description=Office Climate Controller
After=network-online.target
Wants=network-online.target

[Service]
# Run as a non-root user (adjust to your user)
User=dietpi
Group=dietpi

# Where your project lives
WorkingDirectory=/home/michal/code/office-climate-controller

# Choose one:
# If you use npm start:
# ExecStart=/usr/bin/npm start
# Or run the built JS directly:
ExecStart=/usr/bin/node /home/michal/code/office-climate-controller/dist/server.js

Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Reload and enable it:

```shell
sudo systemctl daemon-reload
sudo systemctl enable office-climate.service
sudo systemctl start office-climate.service
```

Now it will start on boot with no login, auto-restart on crash, and you can manage it with:


```shell
sudo systemctl status office-climate
sudo journalctl -u office-climate -f
```
