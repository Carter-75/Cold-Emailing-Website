import os
import sys
import subprocess
import time

def main():
    project_name = "Cold-Emailing-Website"
    project_path = os.path.dirname(os.path.abspath(__file__))

    print(f"\n--- EMERGENCY DELETION: {project_name} ---")
    print(f"Target Path: {project_path}\n")

    # 3 Warnings
    input(f"WARNING 1/3: This will PERMANENTLY delete everything in {project_path}. Press Enter to continue...")
    input("WARNING 2/3: All code, git history, and node_modules will be GONE. Press Enter to continue...")
    input(f"WARNING 3/3: FINAL CONFIRMATION. You are about to destroy {project_name} at {project_path}. Press Enter to continue...")

    # Final verification
    confirm = input(f"\nTo confirm, type the exact project name '{project_name}': ").strip()

    if confirm == project_name:
        print("\nOK. Initiating force-deletion in 1 second...")
        # PowerShell command to wait 1 second and then delete the folder
        # We spawn it as a separate process so this script can exit and unlock the folder
        cmd = f"Start-Sleep -s 1; Remove-Item -Path '{project_path}' -Recurse -Force"
        subprocess.Popen(["powershell", "-Command", cmd], shell=True)
        sys.exit(0)
    else:
        print("\nName mismatch. Deletion cancelled.")

if __name__ == '__main__':
    main()
