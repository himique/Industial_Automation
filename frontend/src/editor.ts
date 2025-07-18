import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Sortable from 'sortablejs';
import * as TWEEN from '@tweenjs/tween.js';
import { fetchGraphQL } from './api';
import { checkUserSession } from './auth';
// --- Интерфейсы для данных ---
interface Component {
    // Временный ID на фронтенде, пока не получили из БД
    tempId: number;
    // "Человеческое" имя, которое вводит админ
    name: string;
    // Имя меша из 3D-модели
    meshId: string;
}
// --- ДОБАВЬТЕ ЭТОТ ИНТЕРФЕЙС ---
interface Label {
    element: HTMLElement;
    target: THREE.Object3D; // К какому 3D-объекту "привязана" метка
}

// --- Основной класс редактора ---
class AssemblyEditor {
    // 3D
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private tweenGroup: TWEEN.Group;
    private model?: THREE.Group;
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();

    // Подсветка
    private selectedMesh: THREE.Mesh | null = null;
    private originalMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();
    private highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0x8f5b00 });

    // UI Элементы
    private labels: Label[] = [];
    private meshNameEl: HTMLElement;
    private componentNameInput: HTMLInputElement;
    private addComponentBtn: HTMLButtonElement;
    private componentListEl: HTMLElement;
    private stepListEl: HTMLElement;
    private savePlanBtn: HTMLButtonElement;
    private uploadModelBtn: HTMLButtonElement;
    private uploadInput: HTMLInputElement;
    // Состояние редактора
    private components: Component[] = [];
    private productId: number | null = null;

    constructor() {
        // Проверяем авторизацию при входе на страницу

        this.tweenGroup = new TWEEN.Group();
        // Получаем ID продукта из URL
        const urlParams = new URLSearchParams(window.location.search);
        this.productId = Number(urlParams.get('product_id'));
        if (!this.productId) {
            alert("Error: Product ID not found in URL. Redirecting...");
            window.location.href = '/'; // Перенаправляем на главную, если нет ID
        }

        // --- Инициализация UI ---
        this.meshNameEl = document.getElementById('mesh-name')!;
        this.componentNameInput = document.getElementById('component-name-input') as HTMLInputElement;
        this.addComponentBtn = document.getElementById('add-component-btn') as HTMLButtonElement;
        this.componentListEl = document.getElementById('component-list')!;
        this.stepListEl = document.getElementById('step-list')!;
        this.savePlanBtn = document.getElementById('save-plan-btn') as HTMLButtonElement;
        this.uploadModelBtn = document.getElementById('upload-model-btn') as HTMLButtonElement;
        this.uploadInput = document.getElementById('upload-model-input') as HTMLInputElement;
        if (!this.uploadModelBtn || !this.uploadInput) {
            throw new Error("Could not find model upload buttons in DOM.");
        }
        this.savePlanBtn.addEventListener('click', this.savePlan);
        this.uploadModelBtn.addEventListener('click', () => this.uploadInput.click());
        this.uploadInput.addEventListener('change', this.handleFileUpload);
        // --- Инициализация 3D ---
        const container = document.getElementById('viewer-container')!;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x282c34);
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.addLights();

        // --- Навешиваем события ---
        this.renderer.domElement.addEventListener('click', this.onCanvasClick);
        this.addComponentBtn.addEventListener('click', this.addComponentToList);
        this.savePlanBtn.addEventListener('click', this.savePlan);

        // Инициализация Drag-and-Drop для списка шагов
        new Sortable(this.stepListEl, { animation: 150 });

        // Загружаем модель (пока захардкожено, в идеале путь должен приходить с бэкенда)
        this.initEditor();
        this.animate();
    }
    private async initEditor() {
        // Запрашиваем всю информацию о продукте
        const query = `
            query GetProduct($productId: ID!) { 
            productById(productId: $productId) {
                id
                name
                modelPath
            }
        }
    `;
        try {
            const isAdmin = await checkUserSession();
            const data = await fetchGraphQL(query, { productId: this.productId }, true);
            console.log(isAdmin)
            // Защищенный запрос, т.к. только админ видит эту страницу
            if (!isAdmin) {
                if (!data || !data.productById) {
                    throw new Error(`Product with ID ${this.productId} not found.`);
                }

                const product = data.productById;
                const modelPath = product.modelPath;

                if (modelPath) {
                    // Если путь к модели есть, загружаем ее
                    console.log(`Found model path: ${modelPath}. Loading model...`);
                    await this.loadModel(modelPath);
                } else {
                    // Если пути нет, сообщаем пользователю и готовимся к загрузке
                    console.log("Product exists, but has no model. Prompting for upload.");
                    alert(`Product "${product.name}" is ready. Now, please upload a 3D model.`);
                    // Здесь можно показать кнопку "Upload Model", которая по клику вызовет this.uploadInput.click();
                }
            };
            // Проверяем, что продукт вообще найден
        } catch (error) {
            let errorMessage = "Could not initialize editor.";
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            alert(errorMessage);
            console.error(error);
        }
    }
    private handleFileUpload = async (event: Event) => {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) {
            return;
        }
        const file = input.files[0];
        console.log(`Uploading file: ${file.name}`);
        const formData = new FormData();
        formData.append("file", file);

        try {
            // Отправляем файл на бэкенд
            const uploadUrl = `http://localhost:8000/upload-model/${this.productId}`;
            console.log(`Uploading to: ${uploadUrl}`);
            const response = await fetch(uploadUrl, {
                method: 'POST',
                // headers: { // Защищаем этот эндпоинт тоже
                //     'Authorization': `Bearer ${localStorage.getItem("admin_token")}`
                // },
                body: formData,
            });
            if (!response.ok) throw new Error("File upload failed!");

            const result = await response.json();

            // После успешной загрузки, нужно обновить запись в БД
            // У вас пока нет такой мутации, но она понадобится
            // await this.updateProductModelPath(result.path);

            // И загрузить модель во вьювер
            await this.loadModel(result.path);

        } catch (error) {
            if (error instanceof Error) alert(error.message);
        }
    }
    private updateLabels(): void {
        if (!this.model) return;

        this.labels.forEach(label => {
            const position = new THREE.Vector3();
            label.target.getWorldPosition(position);
            position.project(this.camera);

            const isBehindCamera = position.z > 1;
            if (isBehindCamera) {
                label.element.style.display = 'none';
            } else {
                label.element.style.display = 'block';
                const x = (position.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
                const y = (position.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;
                label.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
            }
        });
    }
    // --- Логика клика по 3D модели ---
    private onCanvasClick = (event: MouseEvent) => {
        const bounds = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        this.mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (!this.model) return;
        const intersects = this.raycaster.intersectObject(this.model, true);

        if (intersects.length > 0 && intersects[0].object instanceof THREE.Mesh) {
            const clickedObject = intersects[0].object;
            // Сбрасываем подсветку с предыдущего объекта
            if (this.selectedMesh) {
                this.selectedMesh.material = this.originalMaterials.get(this.selectedMesh.name)!;
            }
            // Подсвечиваем новый
            this.selectedMesh = clickedObject;
            this.selectedMesh.material = this.highlightMaterial;
            // Обновляем UI
            this.meshNameEl.textContent = this.selectedMesh.name;
        }
    }

    // --- Добавление компонента в наш локальный список ---
    private addComponentToList = () => {
        if (!this.selectedMesh) {
            alert("Please select a mesh from the 3D model first!");
            return;
        }
        const componentName = this.componentNameInput.value.trim();
        if (!componentName) {
            alert("Please enter a display name for the component.");
            return;
        }
        if (this.components.some(c => c.meshId === this.selectedMesh!.name)) {
            alert("This mesh has already been added as a component.");
            return;
        }

        const newComponent: Component = {
            tempId: Date.now(),
            name: componentName,
            meshId: this.selectedMesh.name
        };
        this.components.push(newComponent);
        this.renderLists();
        this.componentNameInput.value = '';
    }

    // --- Обновление HTML списков ---
    private renderLists() {
        this.componentListEl.innerHTML = '';
        this.stepListEl.innerHTML = '';

        this.components.forEach(comp => {
            // Рендерим список компонентов
            const li = document.createElement('li');
            li.textContent = `${comp.name} (ID: ${comp.meshId})`;
            this.componentListEl.appendChild(li);

            // Рендерим список шагов (пока просто дублируем)
            const stepLi = document.createElement('li');
            stepLi.dataset.componentId = comp.tempId.toString(); // Сохраняем ID для отправки
            stepLi.innerHTML = `<span class="drag-handle">☰</span> ${comp.name}`;
            this.stepListEl.appendChild(stepLi);
        });
    }

    // --- Сохранение всего плана ---
    private savePlan = async () => {
        if (!this.productId) { /* ... */ return; }
        // ... (другие проверки) ...

        this.savePlanBtn.disabled = true;
        this.savePlanBtn.textContent = 'Saving...';

        try {
            const componentIdMap = new Map<number, number>();

            for (const comp of this.components) {
                // --- ИСПРАВЛЕНИЕ №1 ---
                const mutation = `
                mutation AddComponent($component: ComponentInput!) {
                    addComponent(component: $component)
                }
            `;
                const variables = {
                    component: {
                        productId: this.productId,
                        name: comp.name,
                        meshId: comp.meshId
                    }
                };
                const data = await fetchGraphQL(mutation, variables);
                componentIdMap.set(comp.tempId, data.addComponent);
            }

            const stepNodes = Array.from(this.stepListEl.children) as HTMLLIElement[];
            // ... (код для сбора stepsDataForGQL) ...
            const stepsDataForGQL = stepNodes.map((node, index) => {
                // 1. Получаем временный ID из data-атрибута HTML-элемента
                const tempId = Number(node.dataset.componentId);
                if (!tempId) {
                    // Добавляем проверку на случай, если data-атрибут пуст
                    throw new Error(`Component item in step list is missing a data-component-id attribute.`);
                }

                // 2. Ищем настоящий ID, который мы получили от бэкенда, в нашей Map
                const newId = componentIdMap.get(tempId);
                if (!newId) {
                    // Добавляем проверку на случай, если мы не можем найти соответствие
                    throw new Error(`Could not find a saved component for tempId: ${tempId}`);
                }

                // 3. Возвращаем объект в правильном формате для GraphQL
                return {
                    componentId: newId,      // Используем найденный newId
                    stepNumber: index + 1    // Порядковый номер - это просто индекс в списке
                };
            });


            // --- ИСПРАВЛЕНИЕ №2 ---
            const planMutation = `
            mutation CreateAssemblyPlan($productId: Int!, $planName: String!, $steps: [AssemblyStepInput!]!) {
                createAssemblyPlan(productId: $productId, name: $planName, steps: $steps)
            }
        `;
            const planVariables = {
                productId: this.productId,
                planName: `Assembly Plan for Product #${this.productId}`,
                steps: stepsDataForGQL
            };

            const data = await fetchGraphQL(planMutation, planVariables);

            alert(`Assembly plan saved successfully! Plan ID: ${data.createAssemblyPlan}`);

        } catch (error) {
            if (error instanceof Error) {
                alert(`Error saving plan: ${error.message}`);
            }
        } finally {
            this.savePlanBtn.disabled = false;
            this.savePlanBtn.textContent = 'Save Assembly Plan';
        }
    }

    // --- Защищенная функция для отправки GraphQL-запросов ---

    // --- Вспомогательные 3D-методы ---
    private addLights(): void {
        // Мягкий рассеянный свет, который освещает всё равномерно
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Основной направленный свет, как солнце
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(5, 10, 7.5);
        this.scene.add(dirLight);

        // Дополнительный свет с другой стороны для заполнения теней
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight2.position.set(-5, -10, -7.5);
        this.scene.add(dirLight2);
    }
    private async loadModel(path: string): Promise<void> {
        const loader = new GLTFLoader(); // <-- Вот здесь он будет использоваться
        try {
            const gltf = await loader.loadAsync(path);
            this.model = gltf.scene;

            this.model.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    this.originalMaterials.set(child.name, child.material);
                }
            });

            this.scene.add(this.model);
            // ... Здесь можно вызвать frameArea для начального позиционирования

        } catch (error) {
            console.error("Failed to load model:", error);
        }
    }
    private animate = (): void => {
        requestAnimationFrame(this.animate);

        this.tweenGroup.update();
        this.controls.update(); // <--- ДОБАВЬТЕ ЭТУ СТРОКУ

        this.updateLabels(); // Эта строка вызовет следующую ошибку, сейчас исправим
        this.renderer.render(this.scene, this.camera);
    }
}

new AssemblyEditor();