# create_admin.py
import asyncio
import asyncpg
from passlib.context import CryptContext

# --- ИСПРАВЛЯЕМ НАСТРОЙКИ ---
DB_USER = "postgres"
DB_PASSWORD = "admin123"
DB_HOST = "localhost"
DB_PORT = 5050
DB_NAME = "firma"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

async def main():
    # --- ИСПРАВЛЯЕМ ВЫЗОВ ФУНКЦИИ ---
    # Добавляем параметр port=DB_PORT
    conn = await asyncpg.connect(
        user=DB_USER, 
        password=DB_PASSWORD, 
        host=DB_HOST, 
        port=DB_PORT, 
        database=DB_NAME
    )
    
    admin_username = "admin"
    admin_password = "jungheinrich2025" # Замените на надежный пароль
    hashed_password = get_password_hash(admin_password)

    await conn.execute(
        """
        INSERT INTO users (username, hashed_password, is_admin, is_active)
        VALUES ($1, $2, TRUE, TRUE)
        ON CONFLICT (username) DO NOTHING;
        """,
        admin_username,
        hashed_password
    )
    print(f"Admin user '{admin_username}' created or already exists.")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())