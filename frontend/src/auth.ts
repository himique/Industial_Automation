const GetMyTokenURL= 'http://localhost:8000/auth/token/me'

export async function checkUserSession(): Promise<object | null> {
    try {
        const response = await fetch(GetMyTokenURL, {
            method: 'GET',
            credentials: 'include', // ОБЯЗАТЕЛЬНО, чтобы браузер отправил cookie
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const userData = await response.json();
            console.log("Пользователь авторизован:", userData);
            return userData;
        } else {
            console.log("Пользователь не авторизован.");
            return null;
        }
    } catch (error) {
        console.error("Ошибка при проверке сессии:", error);
        return null;
    }
}
