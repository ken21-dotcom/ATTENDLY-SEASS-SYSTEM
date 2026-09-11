Start all services and open PM2 monitor.
```bash
cd "C:\Users\kenzyy\Documents\IPT\claude code\prototype" && pm2 start ecosystem.config.cjs && start wt.exe -d "C:\Users\kenzyy\Documents\IPT\claude code\prototype" pwsh -NoExit -c "pm2 monit"
```
