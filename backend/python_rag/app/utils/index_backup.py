from supabase import create_client
from app.config import settings
import os

def get_supabase():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

def backup_index_file(local_path: str, storage_key: str):
    """Upload a local index file to Supabase Storage faiss-indexes bucket."""
    sb = get_supabase()
    if not sb or not os.path.exists(local_path):
        return
    with open(local_path, 'rb') as f:
        data = f.read()
    try:
        sb.storage.from_('faiss-indexes').upload(storage_key, data, {'upsert': 'true'})
    except Exception as e:
        print(f"Index backup failed (non-critical): {e}")

def restore_index_file(local_path: str, storage_key: str) -> bool:
    """Download an index file from Supabase Storage if it exists."""
    sb = get_supabase()
    if not sb:
        return False
    try:
        response = sb.storage.from_('faiss-indexes').download(storage_key)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, 'wb') as f:
            f.write(response)
        return True
    except Exception:
        return False  # index not in storage yet
