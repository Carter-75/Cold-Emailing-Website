import os
import requests
from pathlib import Path
from dotenv import load_dotenv

def sync_vercel_env():
    """
    Reads the root .env.local and syncs each variable to the Vercel Production vault 
    using the official REST API. (Upgraded to high-performance REST version)
    """
    env_path = Path('.env.local')
    
    if not env_path.exists():
        print("❌ No .env.local file found in the root. Skipping sync.")
        return

    # Load credentials from .env.local
    load_dotenv(dotenv_path=env_path)

    # Vercel Configuration (Required for API access)
    # These must be in your .env.local
    VERCEL_TOKEN = os.getenv('VERCEL_TOKEN')
    VERCEL_PROJECT_ID = os.getenv('VERCEL_PROJECT_ID')

    if not VERCEL_TOKEN or not VERCEL_PROJECT_ID:
        return

    print(f"\033[94mVercel Watcher: Syncing Cold-Emailing-Website to Production Vault...\033[0m")
    
    env_vars = {}
    with open(env_path, "r", encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            env_vars[key] = val

    headers = {
        'Authorization': f'Bearer {VERCEL_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    # 1. Fetch existing env
    try:
        res = requests.get(f'https://api.vercel.com/v9/projects/{VERCEL_PROJECT_ID}/env', headers=headers)
        res.raise_for_status()
        existing_env = res.json().get('envs', [])
    except Exception as e:
        print(f"\033[91mERROR: Failed to fetch existing variables: {e}\033[0m")
        return

    keys_to_sync = [k for k in env_vars.keys() if k not in ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID']]

    for key in keys_to_sync:
        val = env_vars[key]
        target_key = key # No prefix for this project
        
        existing_var = next((e for e in existing_env if e['key'] == target_key and 'production' in e['target']), None)

        try:
            if existing_var:
                # Only update if the value changed
                if existing_var.get('value') == val:
                    continue

                print(f"   UPDATING: {target_key}...")
                requests.patch(
                    f"https://api.vercel.com/v9/projects/{VERCEL_PROJECT_ID}/env/{existing_var['id']}",
                    headers=headers,
                    json={'value': val, 'target': ['production']}
                ).raise_for_status()
            else:
                print(f"   CREATING: {target_key}...")
                requests.post(
                    f"https://api.vercel.com/v10/projects/{VERCEL_PROJECT_ID}/env",
                    headers=headers,
                    json={
                        'key': target_key,
                        'value': val,
                        'type': 'encrypted',
                        'target': ['production']
                    }
                ).raise_for_status()
        except Exception as e:
            print(f"\033[91m   [!] Failed to sync {target_key}: {e}\033[0m")

    print("\033[92mOK: Cold-Emailing-Website Vercel Vault synchronized.\033[0m")

if __name__ == "__main__":
    sync_vercel_env()
