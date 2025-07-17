// Файл: frontend/src/login.ts

class LoginPage {
    private form: HTMLFormElement;
    private errorMessageEl: HTMLElement;

    constructor() {
        this.form = document.getElementById('login-form') as HTMLFormElement;
        this.errorMessageEl = document.getElementById('error-message') as HTMLElement;
        if (!this.form || !this.errorMessageEl) throw new Error("DOM elements not found.");
        this.form.addEventListener('submit', this.handleLogin);
    }

    private handleLogin = async (event: SubmitEvent): Promise<void> => {
        event.preventDefault();
        this.errorMessageEl.style.display = 'none';
        
        // FormData - это правильный формат для OAuth2PasswordRequestForm
        const formData = new FormData(this.form);

        try {
            const response = await fetch('http://localhost:8000/auth/token', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.detail || "Login failed.");
            }
            
            // Успех! Сервер установил cookie, просто делаем редирект.
            window.location.href = '/dashboard.html';

        } catch (error) {
            this.errorMessageEl.textContent = (error instanceof Error) ? error.message : "Unknown error.";
            this.errorMessageEl.style.display = 'block';
        }
    }
}

new LoginPage();