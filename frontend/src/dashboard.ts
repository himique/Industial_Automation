// frontend/src/dashboard.ts

import { fetchGraphQL } from './api';
import { checkUserSession } from './auth';

// Интерфейс для данных, которые мы получаем
interface Product {
    id: number;
    name: string;
}

class Dashboard {
    // Свойства, относящиеся только к этой странице
    private createBtn: HTMLButtonElement;
    private productNameInput: HTMLInputElement;
    private productListEl: HTMLElement;

    constructor() {
        // Проверяем, что админ залогинен


        // Находим элементы на странице dashboard.html
        this.createBtn = document.getElementById('create-product-btn') as HTMLButtonElement;
        this.productNameInput = document.getElementById('new-product-name') as HTMLInputElement;
        this.productListEl = document.getElementById('product-list')!;

        // Навешиваем события
        this.createBtn.addEventListener('click', this.createProduct);

        // Загружаем список продуктов при открытии страницы
        this.loadProducts();
    }

    private async loadProducts() {
        const query = `
            query GetAllProducts {
                allProducts {
                    id
                    name
                }
            }
        `;
        try {
            const isAdmin = await checkUserSession();
            console.log(isAdmin);
            // Защищенный запрос, т.к. только админ видит эту страницу
            if (isAdmin) {
                const data = await fetchGraphQL(query, {}, true);
                const products: Product[] = data.allProducts;
                this.productListEl.innerHTML = ''; // Очищаем старый список

                if (products.length === 0) {
                    this.productListEl.innerHTML = '<li>No products found. Create one!</li>';
                    return;
                }

                // Для каждого продукта создаем элемент списка с кнопкой "Edit"
                products.forEach(product => {
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.justifyContent = 'space-between';
                    li.style.alignItems = 'center';

                    const textSpan = document.createElement('span');
                    textSpan.textContent = `${product.name} (ID: ${product.id})`;

                    const editButton = document.createElement('button');
                    editButton.textContent = 'Edit';
                    editButton.style.width = 'auto';
                    editButton.style.padding = '5px 10px';

                    // Кнопка "Edit" перенаправляет на редактор с нужным ID
                    editButton.onclick = () => {
                        window.location.href = `/editor.html?product_id=${product.id}`;
                    };

                    li.appendChild(textSpan);
                    li.appendChild(editButton);
                    this.productListEl.appendChild(li);
                });
            };

        } catch (error) {
            if (error instanceof Error) {
                this.productListEl.innerHTML = `<li>Error loading products: ${error.message}</li>`;
            }
        }
    }

    private createProduct = async () => {
        const name = this.productNameInput.value.trim();
        if (!name) {
            alert("Please enter a product name.");
            return;
        }

        // В мутации на бэкенде мы убрали description, так что и здесь он не нужен
        const mutation = `
    mutation CreateNewProduct($name: String!) {
        createProduct(name: $name, description: ""){
            id
            name
            
        }
    }
    `;

        try {
            // --- ИСПРАВЛЕНИЕ: ДОБАВЛЯЕМ 'true' ---
            // Теперь fetchGraphQL будет знать, что нужно добавить токен
            const data = await fetchGraphQL(mutation, { name }, true);

            const newProductId = data.createProduct.id;
            console.log(newProductId)
            alert(`Product created! ID: ${newProductId}. Redirecting to editor...`);
            window.location.href = `/editor.html?product_id=${newProductId}`;

        } catch (error) {
            if (error instanceof Error) {
                alert(`Error creating product: ${error.message}`);
            }
        }
    }
}

// Создаем экземпляр класса, чтобы все заработало
new Dashboard();