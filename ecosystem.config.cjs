module.exports = {
  apps: [
    {
      name: 'vidhyalayam',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'worker-demand',
      script: 'npm',
      args: 'run worker:demand-slips',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-notifications',
      script: 'npm',
      args: 'run worker:notifications',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-exports',
      script: 'npm',
      args: 'run worker:exports',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-audit',
      script: 'npm',
      args: 'run worker:audit-retention',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
