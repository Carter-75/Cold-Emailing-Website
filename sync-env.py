import os
import subprocess
import re
from pathlib import Path

def parse_env(file_path):
    """Parses a .env file into a dictionary."""
    env = {}
    if not file_path.exists():
        return env
    with open(file_path, "r", encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            # Strip quotes
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            env[key] = val
    return env

def sync_vercel_env():
    """Smart Sync: Updates only changed environment variables in Vercel Production vault."""
    local_path = Path('.env.local')
    remote_tmp = Path('.env.vercel.tmp')
    
    if not local_path.exists():
        print("?? No .env.local file found. Skipping sync.")
        return

    print("Vercel Watcher: Performing Smart Sync...")
    
    try:
        # 1. Pull current production state to compare
        try:
            subprocess.run(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", "npx vercel env pull .env.vercel.tmp --environment production --yes"],
                capture_output=True, check=True
            )
        except subprocess.CalledProcessError as e:
            print(f"?? Warning: Failed to pull remote env for comparison. Falling back to full sync.\n{e.stderr.decode()}")

        local_vars = parse_env(local_path)
        remote_vars = parse_env(remote_tmp)
        
        # Force Production Context
        local_vars['PRODUCTION'] = 'true'
        if 'PROD_BACKEND_URL' in local_vars:
            local_vars['BACKEND_URL'] = local_vars['PROD_BACKEND_URL']
        if 'PROD_FRONTEND_URL' in local_vars:
            local_vars['FRONTEND_URL'] = local_vars['PROD_FRONTEND_URL']

        to_sync = []
        for key, val in local_vars.items():
            if key.startswith('VERCEL_'): continue # Skip Vercel system vars
            
            if key not in remote_vars or remote_vars[key] != val:
                to_sync.append((key, val))
        
        if not to_sync:
            print("? Vercel Vault is already up to date. No sync needed.")
            return

        print(f"? Found {len(to_sync)} variables to update...")
        
        commands = []
        for key, val in to_sync:
            # Escape single quotes for PowerShell
            escaped_val = val.replace("'", "''")
            # Try rm (ignore failure) then add
            commands.append(f"Write-Host '   Syncing {key}...'; npx vercel env rm {key} production --yes 2>$null; npx vercel env add {key} production --value '{escaped_val}' --yes")

        if commands:
            all_commands = "\n".join(commands)
            result = subprocess.run(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", all_commands],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                print(f"?? Error during sync:\n{result.stderr}")
            else:
                print("? Vercel Vault updated successfully.")

    finally:
        if remote_tmp.exists():
            remote_tmp.unlink()


if __name__ == "__main__":
    sync_vercel_env()
