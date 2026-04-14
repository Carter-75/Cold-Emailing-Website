#!/usr/bin/env python3
import os
import json
import subprocess
import ctypes
from pathlib import Path

def ask_input(prompt, default=None, validation_func=None, options=None):
    """
    Robust input loop that handles defaults and validation.
    Displays 'oops wrong input' on failure.
    """
    first_attempt = True
    while True:
        if not first_attempt:
            print("oops wrong input")
        
        display_prompt = f"{prompt}"
        if options:
            display_prompt += f" ({'/'.join(options)})"
        if default:
            display_prompt += f" [default: {default}]"
        
        user_input = input(f"{display_prompt}: ").strip()
        
        # Handle default
        if user_input == "" and default is not None:
            return default
            
        # Validation
        if not user_input and default is None:
            first_attempt = False
            continue
            
        if options and user_input not in options:
            first_attempt = False
            continue
            
        if validation_func and not validation_func(user_input):
            first_attempt = False
            continue
            
        return user_input

def main():
    # 0. Safety Check for Admin (Windows)
    try:
        if ctypes.windll.shell32.IsUserAnAdmin() != 0:
            print("--- WARNING: SCRIPT RUNNING AS ADMINISTRATOR ---")
            print("Creating projects as Admin can make them hard to delete later.")
            print("It is recommended to run this in a standard user terminal.\n")
    except AttributeError:
        # Non-Windows systems ignore this
        pass

    print("--- Unified MEAN Project Generator (Angular + Express + Mongo) ---")
    print("      Features: Physics (Matter.js), Anime.js, Iframe Security\n")

    # 1. Gather Inputs
    project_name = ask_input(
        "Project Name", 
        validation_func=lambda x: x.replace("-", "").replace("_", "").isalnum()
    )
    project_slug = project_name.lower()
    
    fe_port = ask_input(
        "Frontend Port", 
        default="4200", 
        validation_func=lambda x: x.isdigit()
    )
    
    be_port = ask_input(
        "Backend Port", 
        default="3000", 
        validation_func=lambda x: x.isdigit()
    )
    
    css_choice = ask_input(
        "CSS Flavor / Framework", 
        default="tailwind", 
        options=["css", "scss", "bulma", "tailwind"]
    )
    
    use_matter = ask_input(
        "Do you want Matter.js?", 
        default="yes", 
        options=["yes", "no"]
    ) == "yes"

    use_anime = ask_input(
        "Do you want Anime.js?", 
        default="yes", 
        options=["yes", "no"]
    ) == "yes"

    use_confetti = ask_input(
        "Do you want Confetti?", 
        default="yes", 
        options=["yes", "no"]
    ) == "yes"

    ai_choice = ask_input(
        "Which AI tools do you want to configure?", 
        default="Agents.md", 
        options=["Agents.md", "Cursor", "Claude", "None"]
    )

    fe_hosting = ask_input(
        "Frontend Hosting",
        default="vercel",
        options=["vercel", "other"]
    )

    be_hosting = ask_input(
        "Backend Hosting",
        default="vercel",
        options=["vercel", "other"]
    )
    
    project_root = Path.cwd() / project_name
    if project_root.exists():
        print(f"Error: Directory {project_name} already exists.")
        return

    project_root.mkdir()
    backend_root = project_root / "backend"
    frontend_root = project_root / "frontend"
    backend_root.mkdir()
    frontend_root.mkdir()

    print(f"\nCreating project '{project_name}' in {project_root}...")

    # --- Backend Templates ---
    be_package_json = {
        "name": f"{project_name}-backend",
        "version": "1.0.0",
        "scripts": {
            "start": "node ./bin/www",
            "dev": "nodemon ./bin/www"
        },
        "dependencies": {
            "express": "^4.19.2",
            "cors": "^2.8.5",
            "cookie-parser": "~1.4.6",
            "debug": "~2.6.9",
            "morgan": "~1.10.0",
            "mongoose": "^8.0.0",
            "helmet": "^7.1.0",
            "dotenv": "^16.4.5",
            "openai": "^4.55.0",
            "ws": "^8.18.0",
            "zod": "^3.23.8"
        },
        "devDependencies": {
            "nodemon": "^3.1.0"
        }
    }

    be_app_js = """// Explicit Environment Resolution
const path = require('path');
const fs = require('fs');
const resolveEnvPath = () => {
  const candidates = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), 'backend', '.env.local')];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return candidates[0];
};
require('dotenv').config({ path: resolveEnvPath() });
const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');

// Environment Detection
const isProduction = process.env.PRODUCTION === 'true' ||
                   process.env.VERCEL === '1' ||
                   process.env.NODE_ENV === 'production';

const app = express();

// --- Diagnostic Routes ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    cwd: process.cwd(),
    dirname: __dirname,
    env: isProduction ? 'production' : 'development',
    dbStatus: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
  });
});

// Debug route — dev-only (exposes filesystem tree)
if (!isProduction) {
  app.get('/api/debug-bundle', async (req, res) => {
    const fsPromises = require('fs').promises;
    async function listFiles(dir) {
      let results = [];
      const list = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const file of list) {
        const filePath = path.resolve(dir, file.name);
        if (file.isDirectory()) {
          results.push({ name: file.name, type: 'dir', children: await listFiles(filePath) });
        } else {
          results.push({ name: file.name, type: 'file' });
        }
      }
      return results;
    }
    try {
      const root = await listFiles(process.cwd());
      res.json({ root });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

const indexRouter = require('./routes/index');
// Optional: Mount an AI router if one exists
// const aiRouter = require('./routes/ai');

const PROJECT_NAME = process.env.PROJECT_NAME || 'MEAN Project';

// --- MongoDB Setup ---
const mongoURI = process.env.MONGODB_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('OK: Connected to MongoDB'))
    .catch(err => {
      console.error('WARN: MongoDB Connection Error (Graceful):', err.message);
      console.log('INFO: Continuing without database features...');
    });
} else {
  console.log('INFO: No MONGODB_URI found in .env.local. Database features disabled.');
}

// --- Middlewares ---
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- Iframe Security ---
const prodUrl = process.env.PROD_FRONTEND_URL;

const frameAncestors = ["'self'", "https://carter-portfolio.fyi", "https://carter-portfolio.vercel.app", "https://*.vercel.app", `http://localhost:${process.env.PORT || '""" + be_port + """'}`];
if (prodUrl) {
  frameAncestors.push(prodUrl);
}
if (process.env.PROD_BACKEND_URL) {
  frameAncestors.push(process.env.PROD_BACKEND_URL);
}
 
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": frameAncestors,
    },
  },
}));
 
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL'); // For compatibility
  next();
});

app.get('/', (req, res) => {
  res.send(`API for ${PROJECT_NAME} is running at /api`);
});

app.use('/api', indexRouter);

// Error handler (Hardened for Production JSON output)
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error(`ERROR ${status}:`, err.message);
  res.status(status).json({
    status: 'error',
    message: err.message,
    code: status,
    diagnostic: isProduction ? undefined : { stack: err.stack }
  });
});

module.exports = app;
"""

    be_www = """#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const app = require('../app');
const http = require('http');

const port = process.env.PORT || '3000';
app.set('port', port);

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Backend listening on port ${port} (Project: ${process.env.PROJECT_NAME})`);
});
"""

    be_routes_index = """const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API' });
});

module.exports = router;
"""

    # --- Frontend Templates (MEAN / Angular v21) ---
    fe_deps = {
        "@angular/common": "^21.2.0",
        "@angular/compiler": "^21.2.0",
        "@angular/core": "^21.2.0",
        "@angular/forms": "^21.2.0",
        "@angular/platform-browser": "^21.2.0",
        "@angular/router": "^21.2.0",
        "rxjs": "~7.8.0",
        "tslib": "^2.3.0"
    }
    
    fe_dev_deps = {
        "@angular/build": "^21.2.7",
        "@angular/cli": "^21.2.7",
        "@angular/compiler-cli": "^21.2.0",
        "jsdom": "^28.0.0",
        "prettier": "^3.8.1",
        "typescript": "~5.9.2",
        "vitest": "^4.0.8"
    }

    if css_choice == "tailwind":
        fe_dev_deps.update({"tailwindcss": "^3.4.1", "postcss": "^8.4.35", "autoprefixer": "^10.4.18"})
    elif css_choice == "bulma":
        fe_deps.update({"bulma": "^1.0.1"})

    if use_matter:
        fe_deps.update({"matter-js": "^0.19.0"})
        fe_dev_deps.update({"@types/matter-js": "^0.19.6"})
    
    if use_anime:
        fe_deps.update({"animejs": "^3.2.2"})
        fe_dev_deps.update({"@types/animejs": "^3.1.12"})

    if use_confetti:
        fe_deps.update({"canvas-confetti": "^1.9.3"})
        fe_dev_deps.update({"@types/canvas-confetti": "^1.6.4"})

    fe_package_json = {
        "name": f"{project_name.lower()}-frontend",
        "version": "0.0.0",
        "scripts": {
            "ng": "ng",
            "start": "ng serve",
            "build": "node scripts/build-tasks.js prebuild && ng build && node scripts/build-tasks.js postbuild",
            "watch": "ng build --watch --configuration development",
            "test": "vitest"
        },
        "private": True,
        "dependencies": fe_deps,
        "devDependencies": fe_dev_deps
    }

    # Styles extension
    style_ext = "css"
    if css_choice == "scss": style_ext = "scss"

    fe_angular_json = {
        "version": 1,
        "projects": {
            "frontend": {
                "projectType": "application",
                "root": "",
                "sourceRoot": "src",
                "prefix": "app",
                "architect": {
                    "build": {
                        "builder": "@angular/build:application",
                        "options": {
                            "outputPath": "dist/frontend",
                            "index": "src/index.html",
                            "browser": "src/main.ts",
                            "tsConfig": "tsconfig.app.json",
                            "assets": [
                                { "glob": "**/*", "input": "public" }
                            ],
                            "styles": [f"src/styles.{style_ext}"]
                        },
                        "configurations": {
                            "production": {
                                "budgets": [
                                    { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
                                    { "type": "anyComponentStyle", "maximumWarning": "4kB", "maximumError": "8kB" }
                                ],
                                "outputHashing": "all"
                            },
                            "development": {
                                "optimization": False,
                                "extractLicenses": False,
                                "sourceMap": True
                            }
                        },
                        "defaultConfiguration": "production"
                    },
                    "serve": {
                        "builder": "@angular/build:dev-server",
                        "options": {
                            "buildTarget": "frontend:build",
                            "port": int(fe_port)
                        },
                        "configurations": {
                            "production": {
                                "buildTarget": "frontend:build:production"
                            },
                            "development": {
                                "buildTarget": "frontend:build:development"
                            }
                        },
                        "defaultConfiguration": "development"
                    }
                }
            }
        }
    }

    # --- Tailwind Config (if selected) ---
    fe_tailwind_config = """/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          'from': { opacity: '0', transform: 'scale(0.92)' },
          'to': { opacity: '1', transform: 'scale(1)' },
        },
        slideInLeft: {
          'from': { opacity: '0', transform: 'translateX(-30px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          'from': { opacity: '0', transform: 'translateX(30px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scaleIn': 'scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slideInLeft': 'slideInLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slideInRight': 'slideInRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    },
  },
  plugins: [],
}
"""
    fe_postcss_config = """module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}
"""

    fe_main_ts = """import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
"""

    fe_app_config_ts = """import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient()
  ]
};
"""



    # --- ApiService Template (Simplified & General) ---
    fe_api_service_ts = """import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  
  // Dynamic API URL mapping
  private get apiUrl(): string {
    const isProd = ('__PRODUCTION__' as string) === 'true';
    const prodBackend = '__PROD_BACKEND_URL__' as string;
    
    // In production, use the absolute URL if provided
    if (isProd) {
      if (prodBackend && prodBackend !== '' && !prodBackend.includes('__PROD_')) {
        return prodBackend.endsWith('/') ? prodBackend.slice(0, -1) + '/api' : prodBackend + '/api';
      }
    }

    // In development and as a production fallback, use relative /api.
    // The dev-launcher handles the local proxy mapping.
    return '/api';
  }

  /**
   * Universal GET wrapper
   */
  getData<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}`);
  }

  /**
   * Universal POST wrapper
   */
  postData<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, body);
  }
}
"""

    fe_build_tasks_js = """const fs = require('fs');
const path = require('path');

function replaceEnv() {
  const file = path.join(__dirname, '..', 'src', 'app', 'services', 'api.service.ts');
  if (!fs.existsSync(file)) return;

  let content = fs.readFileSync(file, 'utf8');
  content = content
    .replace('__PRODUCTION__', process.env.PRODUCTION || 'false')
    .replace('__PROD_BACKEND_URL__', process.env.PROD_BACKEND_URL || '')
    .replace('__PROD_FRONTEND_URL__', process.env.PROD_FRONTEND_URL || '');

  fs.writeFileSync(file, content);
}

function normalizeOutput() {
  const src = path.join(__dirname, '..', 'dist', 'frontend', 'browser');
  const dest = path.join(__dirname, '..', 'dist', 'frontend');

  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true });
  }
}

const task = process.argv[2];
if (task === 'prebuild') replaceEnv();
else if (task === 'postbuild') normalizeOutput();
"""

    root_dev_launcher_js = """const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function isPortAvailable(port) {
  const check = (host) => new Promise((resolve) => {
    const server = net.createServer();
    server.on('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
  
  return (async () => {
    const hosts = ['0.0.0.0', '::', '127.0.0.1', '::1'];
    for (const host of hosts) {
      if (!(await check(host))) return false;
    }
    return true;
  })();
}

async function getAvailablePort(startPort, name) {
  let port = parseInt(startPort);
  while (!(await isPortAvailable(port))) {
    console.log(`[Port Conflict] ${name} port ${port} is in use. Trying ${port + 1}...`);
    port++;
  }
  return port;
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split(/\\r?\\n/).forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    
    const [key, ...valueParts] = trimmedLine.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  });
  return env;
}

async function main() {
  const envPath = path.join(process.cwd(), '.env.local');
  const env = parseEnv(envPath);

  const defaultBePort = env.PORT || '3000';
  const defaultFePort = env.FRONTEND_PORT || '4200';

  console.log('Initializing Smart Dev Launcher (Ephemeral Mode)...');

  const finalBePort = await getAvailablePort(defaultBePort, 'Backend');
  const finalFePort = await getAvailablePort(defaultFePort, 'Frontend');

  const proxyConfig = {
    "/api": {
      "target": `http://localhost:${finalBePort}`,
      "secure": false,
      "changeOrigin": true
    }
  };
  
  const proxyPath = path.join(process.cwd(), 'frontend', 'proxy.conf.json');
  fs.writeFileSync(proxyPath, JSON.stringify(proxyConfig, null, 2));
  console.log(`[Success] Generated temporary proxy: /api -> port ${finalBePort}`);

  const devArgs = [
    'concurrently',
    '--kill-others',
    '--prefix-colors', "blue,magenta",
    '--names', "backend,frontend",
    `"npx nodemon backend/bin/www"`,
    `"cd frontend && npx ng serve --port ${finalFePort} --proxy-config proxy.conf.json"`
  ];

  console.log(`Backend: http://localhost:${finalBePort}`);
  console.log(`Frontend: http://localhost:${finalFePort}`);
  console.log('---');

  const child = spawn('npx', devArgs, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: finalBePort, FRONTEND_PORT: finalFePort }
  });

  child.on('exit', (code) => {
    try { fs.unlinkSync(proxyPath); } catch (e) {}
    process.exit(code);
  });
}

main().catch(err => {
  console.error('[Error] Launcher Error:', err);
  process.exit(1);
});
"""

    # --- Frontend Tooling Templates ---
    fe_tsconfig_json = {
        "compilerOptions": {
            "strict": True,
            "noImplicitOverride": True,
            "noPropertyAccessFromIndexSignature": True,
            "noImplicitReturns": True,
            "noFallthroughCasesInSwitch": True,
            "skipLibCheck": True,
            "isolatedModules": True,
            "experimentalDecorators": True,
            "importHelpers": True,
            "target": "ES2022",
            "module": "preserve",
            "moduleResolution": "bundler",
            "sourceMap": True
        },
        "angularCompilerOptions": {
            "enableI18nLegacyMessageIdFormat": False,
            "strictInjectionParameters": True,
            "strictInputAccessModifiers": True,
            "strictTemplates": True
        },
        "files": [],
        "references": [{ "path": "./tsconfig.app.json" }]
    }

    fe_prettierrc = """{
  "printWidth": 100,
  "singleQuote": true,
  "overrides": [
    {
      "files": "*.html",
      "options": {
        "parser": "angular"
      }
    }
  ]
}
"""

    fe_editorconfig = """# Editor configuration
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.ts]
quote_type = single
ij_typescript_use_double_quotes = false

[*.md]
max_line_length = off
trim_trailing_whitespace = false
"""

    fe_vscode_extensions = {
        "recommendations": [
            "angular.ng-template",
            "esbenp.prettier-vscode",
            "firsttris.vscode-jest-runner"
        ]
    }

    fe_readme = f"""# {project_name}

A full-stack MEAN application (MongoDB, Express, Angular, Node) generated with a premium portfolio template.

## Features
- **Frontend**: Angular v21 (Standalone, Signals)
- **Backend**: Node/Express with Graceful MongoDB
- **Security**: Iframe protection for portfolio embedding
- **Interactive**: Matter.js physics and Anime.js animations

## Development

### 1. Configure Environment
Ensure your `.env.local` file is updated with your `MONGODB_URI`.

### 2. Launch Full Stack
```bash
npm run dev
```
"""

    # Component imports and logic
    imports_list = ["Component", "signal", "inject", "OnInit"]
    if use_matter or use_anime or use_confetti:
        imports_list.extend(["viewChild", "ElementRef", "afterNextRender", "OnDestroy"])
    
    physics_imports = f"import {{ {', '.join(imports_list)} }} from '@angular/core';\nimport {{ ApiService }} from '../services/api.service';\n"
    if use_matter: physics_imports += "import * as Matter from 'matter-js';\n"
    if use_anime: physics_imports += "import anime from 'animejs';\n"
    if use_confetti: physics_imports += "import confetti from 'canvas-confetti';\n"

    physics_variables = ""
    if use_matter:
        physics_variables += "  private engine?: Matter.Engine;\n  private render?: Matter.Render;\n"
    
    physics_init_calls = ""
    if use_matter: physics_init_calls += "      this.initPhysics();\n"
    if use_anime: physics_init_calls += "      this.initAnimation();\n"

    physics_logic = ""
    if use_matter or use_anime or use_confetti:
        physics_logic += f"""
  private container = viewChild<ElementRef<HTMLDivElement>>('scene');
  private card = viewChild<ElementRef<HTMLDivElement>>('card');
{physics_variables}
  constructor() {{
    afterNextRender(() => {{
{physics_init_calls}
      if ({'true' if use_matter else 'false'}) window.addEventListener('resize', this.handleResize);
    }});
  }}

  ngOnDestroy() {{
    if ({'true' if use_matter else 'false'}) window.removeEventListener('resize', this.handleResize);
    {"if (this.render) { Matter.Render.stop(this.render); if (this.render.canvas.parentNode) { this.render.canvas.parentNode.removeChild(this.render.canvas); } }" if use_matter else ""}
    {"if (this.engine) Matter.Engine.clear(this.engine);" if use_matter else ""}
  }}


  private handleResize = () => {{
    const el = this.container()?.nativeElement;
    if (el && {'this.render' if use_matter else 'false'}) {{
      {( 'this.render.canvas.width = el.clientWidth; this.render.options.width = el.clientWidth;' if use_matter else '')}
    }}
  }};
"""
    else:
        physics_logic = ""
    if use_anime:
        physics_logic += """
  private initAnimation() {
    const el = this.card()?.nativeElement;
    if (el) {
      anime({
        targets: el,
        scale: [1, 1.02],
        direction: 'alternate',
        easing: 'easeInOutSine',
        duration: 1400,
        loop: true
      });
    }
  }
"""
    if use_matter:
        physics_logic += """
  private initPhysics() {
    const el = this.container()?.nativeElement;
    if (!el) return;

    this.engine = Matter.Engine.create();
    this.render = Matter.Render.create({
      element: el,
      engine: this.engine,
      options: {
        width: el.clientWidth,
        height: 220,
        background: 'transparent',
        wireframes: false
      }
    });

    const ground = Matter.Bodies.rectangle(el.clientWidth / 2, 210, el.clientWidth, 20, { 
      isStatic: true,
      render: { fillStyle: '#d1d5db' }
    });
    
    const ball = Matter.Bodies.circle(80, 30, 20, { 
      restitution: 0.85,
      render: { fillStyle: '#ffb347' }
    });

    Matter.World.add(this.engine.world, [ground, ball]);
    
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, this.engine);
    Matter.Render.run(this.render);
  }
"""
    fe_app_ts = f"""import {{ Component }} from '@angular/core';
import {{ RouterOutlet }} from '@angular/router';

@Component({{
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
}})
export class App {{}}
"""

    fe_app_routes_ts = """import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent }
];
"""

    fe_home_component_ts = f"""{physics_imports}
@Component({{
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.{style_ext}'
}})
export class HomeComponent implements OnInit {{
  private api = inject(ApiService);
  protected readonly title = signal('{project_name}');
  
  ngOnInit() {{
    this.api.getData('ping').subscribe((res: any) => console.log('API Status:', res));
  }}

  {physics_logic}
}}
"""

    # Template logic (Tailwind vs Bulma vs Plain)
    card_classes = "box" if css_choice == "bulma" else "p-8 bg-white rounded-xl shadow-2xl border border-gray-100"
    container_classes = "container" if css_choice == "bulma" else "max-w-4xl mx-auto p-4 flex items-center justify-center min-h-screen"
    scene_classes = "mt-4 border rounded-lg bg-gray-50 h-[220px]" if css_choice == "tailwind" else "scene mt-4"

    fe_home_html = f"""<main class="{container_classes}">
  <div #card class="{card_classes} text-center">
    <p class="text-xs uppercase tracking-widest text-gray-500 mb-2">Portfolio Project</p>
    <h1 class="text-4xl font-bold mb-4 font-inter">Welcome to {project_name}</h1>
    <p class="text-gray-600 mb-6">Built with Angular v21, Node/Express, and MongoDB.</p>
    

    <div #scene class="{scene_classes}">
      <!-- Physics Scene -->
    </div>
  </div>
</main>
"""

    fe_index_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{project_name}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
  { '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.1/css/bulma.min.css">' if css_choice == 'bulma' else '' }
</head>
<body class="bg-slate-50">
  <app-root></app-root>
</body>
</html>
"""

    # --- Write Backend ---
    (backend_root / "package.json").write_text(json.dumps(be_package_json, indent=2), encoding='utf-8')
    (backend_root / "app.js").write_text(be_app_js, encoding='utf-8')
    (backend_root / "bin").mkdir()
    (backend_root / "bin" / "www").write_text(be_www, encoding='utf-8')
    (backend_root / "routes").mkdir()
    (backend_root / "routes" / "index.js").write_text(be_routes_index, encoding='utf-8')
    (backend_root / "models").mkdir()
    
    if fe_hosting == "vercel" or be_hosting == "vercel":
        # 1. Frontend Proxy Bridge
        fe_vercel_json = {
            "cleanUrls": True,
            "trailingSlash": False,
            "rewrites": [
                { "source": "/api/:path*", "destination": f"https://{project_slug}-backend.vercel.app/api/:path*" },
                { "source": "/(.*)", "destination": "/index.html" }
            ]
        }
        (frontend_root / "vercel.json").write_text(json.dumps(fe_vercel_json, indent=2), encoding='utf-8')

        # 2. Backend Standalone Configuration
        be_vercel_json = {
            "version": 2,
            "functions": {
                "app.js": {
                    "maxDuration": 60,
                    "includeFiles": "{services,models,controllers,routes}/**"
                }
            },
            "rewrites": [
                { "source": "/(.*)", "destination": "app.js" }
            ],
            "headers": [
                {
                    "source": "/(.*)",
                    "headers": [
                        { "key": "X-Frame-Options", "value": "ALLOWALL" },
                        { 
                            "key": "Content-Security-Policy", 
                            "value": "frame-ancestors 'self' https://carter-portfolio.fyi https://carter-portfolio.vercel.app https://*.vercel.app http://localhost:3000" 
                        }
                    ]
                }
            ]
        }
        (backend_root / "vercel.json").write_text(json.dumps(be_vercel_json, indent=2), encoding='utf-8')

    # --- Write Frontend Configs ---
    (frontend_root / "package.json").write_text(json.dumps(fe_package_json, indent=2), encoding='utf-8')
    (frontend_root / "angular.json").write_text(json.dumps(fe_angular_json, indent=2), encoding='utf-8')
    (frontend_root / "tsconfig.json").write_text(json.dumps(fe_tsconfig_json, indent=2), encoding='utf-8')
    
    scripts_dir = frontend_root / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "build-tasks.js").write_text(fe_build_tasks_js, encoding='utf-8')
    (frontend_root / "tsconfig.app.json").write_text(json.dumps({
        "extends": "./tsconfig.json",
        "compilerOptions": { "outDir": "./out-tsc/app", "types": [] },
        "include": ["src/**/*.ts"]
    }, indent=2), encoding='utf-8')
    (frontend_root / ".prettierrc").write_text(fe_prettierrc, encoding='utf-8')
    (frontend_root / ".editorconfig").write_text(fe_editorconfig, encoding='utf-8')
    
    vscode_dir = frontend_root / ".vscode"
    vscode_dir.mkdir()
    (vscode_dir / "extensions.json").write_text(json.dumps(fe_vscode_extensions, indent=2), encoding='utf-8')

    if css_choice == "tailwind":
        (frontend_root / "tailwind.config.js").write_text(fe_tailwind_config, encoding='utf-8')
        (frontend_root / "postcss.config.js").write_text(fe_postcss_config, encoding='utf-8')
    
    (frontend_root / "public").mkdir()
    src_root = frontend_root / "src"
    src_root.mkdir()
    (src_root / "index.html").write_text(fe_index_html, encoding='utf-8')
    
    # Styles
    styles_content = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n" if css_choice == "tailwind" else "/* Global Styles */\n"
    (src_root / f"styles.{style_ext}").write_text(styles_content, encoding='utf-8')
    (src_root / "main.ts").write_text(fe_main_ts, encoding='utf-8')
    
    app_dir = src_root / "app"
    app_dir.mkdir()
    (app_dir / "app.ts").write_text(fe_app_ts, encoding='utf-8')
    (app_dir / "app.config.ts").write_text(fe_app_config_ts, encoding='utf-8')
    (app_dir / "app.routes.ts").write_text(fe_app_routes_ts, encoding='utf-8')

    # Home Component
    home_dir = app_dir / "home"
    home_dir.mkdir()
    (home_dir / "home.component.ts").write_text(fe_home_component_ts, encoding='utf-8')
    (home_dir / "home.component.html").write_text(fe_home_html, encoding='utf-8')
    (home_dir / f"home.component.{style_ext}").write_text("/* Home Styles */\n", encoding='utf-8')

    # Services
    services_dir = app_dir / "services"
    services_dir.mkdir()
    (services_dir / "api.service.ts").write_text(fe_api_service_ts, encoding='utf-8')

    # --- Env File (Root Only) ---
    env_content = f"""PROJECT_NAME={project_name}
PORT={be_port}
FRONTEND_PORT={fe_port}
MONGODB_URI=mongodb://localhost:27017/{project_name}

# --- Production Configuration ---
PRODUCTION=false

# --- Back-End Deployment ---
# Update your vercel.json 'destination' to match the production URL after deployment!
PROD_BACKEND_URL=
PROD_FRONTEND_URL=

# --- API Keys (Replace with your own) ---
OPENAI_API_KEY=
# STRIPE_SECRET_KEY=
"""
    # Note: We write this again later after Vercel initialization to ensure it's preserved.
    (project_root / ".env.local").write_text(env_content, encoding='utf-8')

    # --- Root Files ---
    root_package_json = {
        "name": project_slug,
        "version": "1.0.0",
        "scripts": {
            "postinstall": "cd frontend && npm install && cd ../backend && npm install",
            "install:all": "npm install && cd backend && npm install && cd ../frontend && npm install",
            "dev:backend": "cd backend && npm run dev",
            "dev:frontend": "cd frontend && npm start",
            "dev": "node scripts/dev-launcher.js",
            "build:frontend": "cd frontend && npm run build",
            "build:backend": "cd backend && npm install --production",
            "build": "npm run build:frontend && npm run build:backend",
            "start": "cd backend && npm start"
        },
        "devDependencies": {
            "concurrently": "^8.2.2",
            "dotenv": "^17.4.2",
            "nodemon": "^3.1.0"
        }
    }
    (project_root / "package.json").write_text(json.dumps(root_package_json, indent=2), encoding='utf-8')
    scripts_root = (project_root / "scripts")
    scripts_root.mkdir(exist_ok=True)
    (scripts_root / "dev-launcher.js").write_text(root_dev_launcher_js, encoding='utf-8')
    (project_root / ".gitignore").write_text("node_modules/\ndist/\n.env.local\n.angular/\n.vscode/\n", encoding='utf-8')
    (project_root / "README.md").write_text(fe_readme, encoding='utf-8')

    # Emergency Deletion Script
    delete_project_py = f"""import os
import sys
import subprocess
import time
import shutil

def main():
    project_name = "{project_name}"
    project_path = os.path.dirname(os.path.abspath(__file__))

    print(f"\\n--- EMERGENCY DELETION: {{project_name}} ---")
    print(f"Target Path: {{project_path}}\\n")

    # Check if we are inside the directory
    if os.getcwd() == project_path:
        print("WARNING: You are currently INSIDE the project directory in your terminal.")
        print("I will change the current directory to '..' to allow full deletion.\\n")
        os.chdir('..')

    # 3 Warnings
    input(f"WARNING 1/3: This will PERMANENTLY delete everything in {{project_path}}. Press Enter to continue...")
    input("WARNING 2/3: All code, git history, and node_modules will be GONE. Press Enter to continue...")
    input(f"WARNING 3/3: FINAL CONFIRMATION. You are about to destroy {{project_name}} at {{project_path}}. Press Enter to continue...")

    # Final verification
    confirm = input(f"\\nTo confirm, type the exact project name '{{project_name}}': ").strip()

    if confirm == project_name:
        print("\\nOK. Initiating force-deletion...")
        
        # 1. Try to delete contents first
        for item in os.listdir(project_path):
            if item == 'delete-project.py': continue
            item_path = os.path.join(project_path, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path, ignore_errors=True)
                else:
                    os.remove(item_path)
                print(f"   Deleted: {{item}}")
            except Exception as e:
                print(f"   [!] Could not delete {{item}}: {{e}}")

        # 2. Spawn a background process to kill this script and try to remove the root and itself
        print("\\nAttempting to remove root directory in 1 second...")
        # We use a more aggressive PowerShell command that retries and ignores errors
        cmd = f"Start-Sleep -s 1; 1..5 | % {{{{ Remove-Item -Path '{{project_path}}' -Recurse -Force -ErrorAction SilentlyContinue; if (!(Test-Path '{{project_path}}')) {{{{ break }}}}; Start-Sleep -s 1 }}}}"
        subprocess.Popen(["powershell", "-Command", cmd], shell=True)
        sys.exit(0)
    else:
        print("\\nName mismatch. Deletion cancelled.")

if __name__ == '__main__':
    main()
"""
    (project_root / "delete-project.py").write_text(delete_project_py, encoding='utf-8')

    # AI Config
    ai_rules_common = f"""## Agent Operational Directives
- **File Deletions**: When deleting multiple files, do so one at a time.
- **Syntax**: Always use standard Windows PowerShell syntax (e.g., `Remove-Item`, `New-Item`).
- **Persistence**: If a command fails, try alternative PowerShell methods before giving up.
- **Privacy**: Never expose the `.env.local` file content in logs.
"""

    if ai_choice == "Agents.md":
        (project_root / "AGENTS.md").write_text(f"""# {project_name} - Agent Instructions

This project follows a decoupled MEAN stack architecture.

## Architecture
- **Frontend**: Angular v21+ (located in `/frontend`)
- **Backend**: Node/Express + Mongoose (located in `/backend`)

## Portfolio Requirements
- **Security**: Iframe headers are set to allow embedding in `carter-portfolio.fyi`.
- **CSS**: Using {css_choice}.
- **Features**: {", ".join([f for f, v in [("Physics (Matter)", use_matter), ("Animations (Anime)", use_anime), ("Confetti", use_confetti)] if v]) or "Standard"}.
- **Vercel Watcher**: Persistent sync enabled via `pre-push` git hook.

## Agent Rules
- Always maintain the iframe security headers in `backend/app.js`.
- Prefer Signals for Angular state.
- Use standalone components.
- **Environment**: If you modify the root `.env.local`, remind the user to `git push` to sync with Vercel.

{ai_rules_common}
""", encoding='utf-8')
    elif ai_choice == "Cursor":
        (project_root / ".cursorrules").write_text(f"# {project_name} Cursor Rules\n\n- Angular 21 (Signals, standalone).\n- Maintain iframe CSP headers in backend/app.js.\n\n{ai_rules_common}\n", encoding='utf-8')
    elif ai_choice == "Claude":
        claude_dir = project_root / ".claudecode"
        claude_dir.mkdir()
        (claude_dir / "memory.md").write_text(f"""# Project Memory: {project_name}

## Summary
Decoupled MEAN Stack (Angular {fe_port} / Express {be_port}).

## Tech Stack
- Frontend: Angular v21, Matter-js, Animejs.
- Backend: Express, Mongoose, Helmet.

## Directives
{ai_rules_common}
""", encoding='utf-8')

    # --- Host-Specific Environment Prep ---
    if fe_hosting == "vercel" or be_hosting == "vercel":
        print("\n--- Preparing Vercel Environment ---")
        try:
            # 1. Link Project (Showing output as requested so user can see Vercel environment changes)
            print("Linking to Vercel...")
            subprocess.run(["npx", "vercel", "link", "--yes", "--project", project_slug], cwd=project_root, shell=True, check=True)
            
            # 2. Merge our variables into .env.local (Preserving Vercel-provided tokens like VERCEL_OIDC_TOKEN)
            existing_env = {}
            env_file = project_root / ".env.local"
            if env_file.exists():
                for line in env_file.read_text(encoding='utf-8').splitlines():
                    if "=" in line and not line.strip().startswith("#"):
                        k, v = line.split("=", 1)
                        existing_env[k.strip()] = v.strip()
            
            # Update with our generated content
            for line in env_content.splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    existing_env[k.strip()] = v.strip()
            
            # Write back the merged content
            merged_content = ""
            # Keep original structure for our vars
            merged_content += f"PROJECT_NAME={existing_env.get('PROJECT_NAME', project_name)}\n"
            merged_content += f"PORT={existing_env.get('PORT', be_port)}\n"
            merged_content += f"FRONTEND_PORT={existing_env.get('FRONTEND_PORT', fe_port)}\n"
            merged_content += f"MONGODB_URI={existing_env.get('MONGODB_URI', f'mongodb://localhost:27017/{project_name}')}\n\n"
            merged_content += "# --- Production Configuration ---\n"
            merged_content += f"PRODUCTION={existing_env.get('PRODUCTION', 'false')}\n\n"
            merged_content += "# --- Back-End Deployment ---\n"
            merged_content += f"PROD_BACKEND_URL={existing_env.get('PROD_BACKEND_URL', '')}\n"
            merged_content += f"PROD_FRONTEND_URL={existing_env.get('PROD_FRONTEND_URL', '')}\n\n"
            
            merged_content += "# --- Vercel Managed Variables ---\n"
            for k, v in existing_env.items():
                if k not in ['PROJECT_NAME', 'PORT', 'FRONTEND_PORT', 'MONGODB_URI', 'PRODUCTION', 'PROD_BACKEND_URL', 'PROD_FRONTEND_URL']:
                    merged_content += f"{k}={v}\n"
            
            env_file.write_text(merged_content, encoding='utf-8')

            # 3. Sync .env.local variables to Vault
            print("Syncing .env.local to Vercel Vault...")
            vars_added = 0
            # We only sync our primary app vars, not the Vercel tokens themselves
            sync_keys = ['PROJECT_NAME', 'PORT', 'FRONTEND_PORT', 'MONGODB_URI', 'PRODUCTION', 'PROD_BACKEND_URL', 'PROD_FRONTEND_URL']
            for key in sync_keys:
                if key in existing_env:
                    subprocess.run([
                        "npx", "vercel", "env", "add", key, "production", 
                        "--value", existing_env[key], "--non-interactive", "--yes"
                    ], cwd=project_root, shell=True)
                    vars_added += 1
            print(f"[Success] Vercel Vault synced successfully ({vars_added} variables added).")

        except subprocess.CalledProcessError as e:
            print(f"Warning: Vercel preparation encountered an issue: {e}")
    try:
        subprocess.run(["git", "init"], cwd=project_root, check=True, capture_output=True)
        print("Initialized Git repository.")
        
        # --- Vercel Watcher (Git Hook) ---
        sync_env_py = """import os
import subprocess
from pathlib import Path

def sync_vercel_env():
    \"\"\"Reads the root .env.local and syncs each variable to the Vercel Production vault.\"\"\"
    env_path = Path('.env.local')
    
    if not env_path.exists():
        print(\"?? No .env.local file found in the root. Skipping sync.\")
        return

    print("Vercel Watcher: Syncing local .env.local to Production Vault...")
    
    try:
        # We assume the project is linked (via 'vercel link' or similar)
        # The 'env add' command will handle link errors if they occur
        with open(env_path, "r", encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                
                # Strip surrounding quotes if they exist
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                
                if key and val:
                    # Sync logic using PowerShell for robust escaping on Windows
                    # We pass the value via an environment variable to ensure zero shell interpolation
                    target_env = os.environ.copy()
                    target_env["KV_VAL"] = val

                    # 1. Try to remove existing var (ignore failure if it doesn't exist)
                    subprocess.run(
                        ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", f"npx vercel env rm {key} production --yes"],
                        env=target_env,
                        capture_output=True
                    )
                    
                    # 2. Add/Update the variable using the env var for the value
                    result = subprocess.run(
                        ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", f"npx vercel env add {key} production --value $env:KV_VAL --yes"],
                        env=target_env,
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode != 0:
                        print(f"   [!] Failed to sync {key}: {result.stderr.strip()}")
                    else:
                        print(f"   Synced: {key}")

        print("Vercel Vault is now up to date.")

    except Exception as e:
        print(f"Error during Vercel sync: {e}")

if __name__ == "__main__":
    sync_vercel_env()
"""
        (project_root / "sync-env.py").write_text(sync_env_py, encoding='utf-8')

        pre_push_hook = """#!/bin/sh
# Vercel Watcher Hook
# Syncs local .env.local to Vercel Vault before every push.

echo \"Vercel Watcher: Checking environment status...\"
python sync-env.py

# Always allow the push to continue
exit 0
"""
        hook_path = project_root / ".git" / "hooks" / "pre-push"
        hook_path.write_text(pre_push_hook, encoding='utf-8')

    except Exception as e:
        print(f"Warning: Git/Hook initialization issue: {e}")

    # --- NPM Install ---
    print("\nInstalling dependencies (this may take a few minutes)...")
    try:
        print(f"[{project_name}] Backend npm install...")
        subprocess.run(["npm", "install"], cwd=backend_root, check=True, shell=True)
        print(f"[{project_name}] Frontend npm install...")
        subprocess.run(["npm", "install"], cwd=frontend_root, check=True, shell=True)
        print("Success: Dependencies installed successfully.")
    except Exception as e:
        print(f"Warning: npm install failed: {e}")
    
    # Root install for concurrently
    try:
        print(f"[{project_name}] Root npm install (concurrently)...")
        subprocess.run(["npm", "install"], cwd=project_root, check=True, shell=True)
    except Exception as e:
        print(f"Warning: root npm install failed: {e}")

    print("\nProject creation complete!")
    print(f"Location: {project_root}")
    print("\nNext steps:")
    print(f"  cd {project_name}")
    print(f"  npm run dev")

if __name__ == "__main__":
    main()
