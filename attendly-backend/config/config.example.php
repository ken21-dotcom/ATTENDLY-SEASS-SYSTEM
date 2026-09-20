<?php
/**
 * ATTENDLY — Configuration
 * Copy this file to config.php and fill in your values.
 * config.php is gitignored and never committed.
 */

return [

    // ─── Database ───────────────────────────────────────────────
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'dbname'  => 'attendly',
        'user'    => 'attendly_app',
        'password'=> 'attendly_pass',
        'charset' => 'utf8mb4',
    ],

    // ─── Session ────────────────────────────────────────────────
    'session' => [
        'cookie_name'  => 'attendly.sid',
        'cookie_httponly' => true,
        'cookie_secure'  => false,   // true in production (HTTPS)
        'cookie_samesite' => 'Lax',
        'ttl_hours'    => 8,
    ],

    // ─── CORS ───────────────────────────────────────────────────
    // Allowed origin for cross-origin requests (set to the frontend URL)
    'cors' => [
        'allowed_origin' => 'http://localhost:5173',
    ],

    // ─── Default Admin ──────────────────────────────────────────
    // Used only when no active administrator exists in the database
    'default_admin' => [
        'username' => 'admin',
        'email'    => 'admin@example.com',
        'password' => 'password123',
    ],

    // ─── App ────────────────────────────────────────────────────
    'app' => [
        'env' => 'development',   // 'development' or 'production'
    ],
];
