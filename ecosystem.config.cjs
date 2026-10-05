module.exports = {
  apps: [
    {
      name: 'boreal-node',
      script: './dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/app/pm2_error.log',
      out_file: './logs/app/pm2_out.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'boreal-watchdog',
      script: 'python3',
      args: './deployment/scripts/boreal_watchdog.py',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M'
    }
  ]
};
