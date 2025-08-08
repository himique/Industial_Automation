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
    private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    private defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0, roughness: 0 });
    private highlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff83, emissive: 0x550000, name: 'highlight', metalness: 0, roughness: 1, })

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
    // GraphQl
    private isAdmin = false;
    // Mouse action
    private pressTimer: number | null = null;
    private isLongPress = false;

    constructor() {
        // Проверяем авторизацию при входе на страницу

        this.tweenGroup = new TWEEN.Group();
        // Получаем ID продукта из URL
        //GraphQl endpoint
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
        // Mouse action
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.addEventListener('mouseup', this.onCanvasClick);
        // --- Навешиваем события ---
        this.renderer.domElement.addEventListener('click', this.onCanvasClick);
        this.addComponentBtn.addEventListener('click', this.addComponentToList);
        this.savePlanBtn.addEventListener('click', this.savePlan);

        // Инициализация Drag-and-Drop для списка шагов
        new Sortable(this.stepListEl, { animation: 150 });

        // Загружаем модель (пока захардкожено, в идеале путь должен приходить с бэкенда)

        this.animate();
    }
    public async initialize() {
        const sessionResult = await checkUserSession();

        this.isAdmin = !!sessionResult;
        console.log(`User is admin: ${this.isAdmin}`);
        await this.initEditor();
        
        
        
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

            const data = await fetchGraphQL(query, { productId: this.productId }, true);

            // Защищенный запрос, т.к. только админ видит эту страницу

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
            if (this.isAdmin) {
                console.log(`Есть админ ${this.isAdmin} `);
                const uploadUrl = `http://localhost:8000/upload-model/${this.productId}`;
                console.log(`Uploading to: ${uploadUrl}`);
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData,
                });
                if (!response.ok) throw new Error("File upload failed!");

                const result = await response.json();
                const modelPath = `/${result.path}`
                // И загрузить модель во вьювер
                const isLoaded = await this.loadModel(modelPath);
                console.log(isLoaded);
                if(isLoaded == true){
                    alert("File uploaded succesfully")
                }
                else{
                    alert("Error by file uploading")
                }
                // location.reload();
            }
            else {
                alert("Admin privilege required");
            }
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
    private onMouseDown = (_event: MouseEvent) => {
        // Сбрасываем флаг долгого нажатия
        this.isLongPress = false;

        // Запускаем таймер. Если он сработает, значит, нажатие было долгим.
        this.pressTimer = window.setTimeout(() => {
            // Устанавливаем флаг, что выстрел рейкаста нужно отменить.
            this.isLongPress = true;
        }, 200); // 100 миллисекунд = 0.1 секунды
    }
    // --- Логика клика по 3D модели ---
    private onCanvasClick = (event: MouseEvent) => {
        if (this.pressTimer) {
            clearTimeout(this.pressTimer);
        }

        // Если флаг isLongPress был установлен таймером, значит, это было долгое нажатие.
        // Ничего не делаем, просто выходим из функции.
        if (this.isLongPress) {
            return; // ВЫСТРЕЛ ОТМЕНЕН
        }
        const bounds = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        this.mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (!this.model) return;
        const intersects = this.raycaster.intersectObject(this.model, true);

        if (intersects.length > 0 && intersects[0].object instanceof THREE.Mesh) {

            // Сбрасываем подсветку с предыдущего объекта
            if (this.selectedMesh) {
                // Получаем его сохраненный оригинальный материал
                const originalMaterial = this.originalMaterials.get(this.selectedMesh);
                // Проверяем, что материал действительно был найден, прежде чем его применить
                if (originalMaterial) {
                    this.selectedMesh.material = originalMaterial;
                }
            }

            // 2. Если клик был в пустоту, просто сбрасываем состояние и выходим.
            if (intersects.length === 0) {
                this.selectedMesh = null;
                this.meshNameEl.textContent = 'None';
                return;
            }
            // 3. Если клик попал на меш, обрабатываем новое выделение.
            const clickedObject = intersects[0].object;
            if (clickedObject instanceof THREE.Mesh) {
                // Сохраняем ссылку на новый выделенный объект
                this.selectedMesh = clickedObject;

                // Сохраняем его оригинальный материал (если он еще не был сохранен)
                if (!this.originalMaterials.has(this.selectedMesh)) {
                    this.originalMaterials.set(this.selectedMesh, this.selectedMesh.material);
                }

                // Применяем материал для подсветки
                this.selectedMesh.material = this.highlightMaterial;

                // Обновляем UI
                this.meshNameEl.textContent = this.selectedMesh.name;
            } else {
                // Если пересечение есть, но это не меш (например, линия или точка)
                this.selectedMesh = null;
                this.meshNameEl.textContent = 'None';
            }
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
        if (!this.productId) {
            alert("Product ID is missing.");
            return;
        }

        if (this.components.length === 0) {
            alert("Please add at least one component to the list before saving.");
            return;
        }

        const stepNodes = Array.from(this.stepListEl.children) as HTMLLIElement[];
        if (stepNodes.length === 0) {
            alert("The assembly steps list is empty. Please define the assembly order.");
            return;
        }

        this.savePlanBtn.disabled = true;
        this.savePlanBtn.textContent = 'Сохранение...';

        try {
            // Map для сопоставления временного ID с фронтенда (tempId)
            // с реальным ID, полученным из базы данных.
            const componentIdMap = new Map<number, number>();

            // ЭТАП 1: Сохраняем каждый компонент по отдельности, чтобы получить его реальный ID.
            for (const comp of this.components) {
                const mutation = `
                mutation AddComponent($component: ComponentInput!) {
                    addComponent(component: $component){
                        id # Нам от сервера нужен только ID
                    }
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

                // --- ИСПРАВЛЕНИЕ №1: Сохраняем только числовой ID, а не весь объект. ---
                if (data && data.addComponent && typeof data.addComponent.id === 'number') {
                    componentIdMap.set(comp.tempId, data.addComponent.id);
                } else {
                    // Прерываем выполнение, если сервер не вернул корректный ID.
                    throw new Error(`Не удалось получить корректный ID для компонента "${comp.name}".`);
                }
            }

            // ЭТАП 2: Формируем данные для шагов сборки, используя реальные ID.
            const stepsDataForGQL = stepNodes.map((node, index) => {
                const tempId = Number(node.dataset.componentId);
                if (!tempId) {
                    throw new Error(`Элемент в списке шагов не имеет атрибута data-component-id.`);
                }

                // Находим реальный ID, сохраненный на предыдущем шаге.
                const newId = componentIdMap.get(tempId);
                if (newId === undefined) {
                    throw new Error(`Не удалось найти сохраненный компонент для временного ID: ${tempId}`);
                }

                // --- ИСПРАВЛЕНИЕ №2: Формируем объект шага в правильном формате. ---
                return {
                    componentId: newId,      // Теперь это корректное число (Int).
                    stepNumber: index + 1,
                    actionType: "Assemble" // Добавлено недостающее обязательное поле.
                };
            });

            // ЭТАП 3: Создаем сам план сборки с уже подготовленным массивом шагов.
            const planMutation = `
            mutation CreateAssemblyPlan($productId: Int!, $planName: String!, $steps: [AssemblyStepInput!]!) {
                createAssemblyPlan(productId: $productId, name: $planName, steps: $steps){
                    id
                    name
                }
            }
        `;

            const planVariables = {
                productId: this.productId,
                planName: `Assembly Plan for Product #${this.productId}`,
                steps: stepsDataForGQL
            };

            const result = await fetchGraphQL(planMutation, planVariables);

            alert(`План сборки успешно сохранен! ID плана: ${result.createAssemblyPlan.id}`);

        } catch (error) {
            if (error instanceof Error) {
                alert(`Ошибка при сохранении плана: ${error.message}`);
                console.error(error);
            }
        } finally {
            this.savePlanBtn.disabled = false;
            this.savePlanBtn.textContent = 'Сохранить план сборки';
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
    private async loadModel(path: string): Promise<boolean> {
        const loader = new GLTFLoader();
        try {
            const fullUrl = `http://localhost:8000${path}`;
            console.log(`Attempting to load model from: ${fullUrl}`);
            const gltf = await loader.loadAsync(fullUrl);
            const newModel = gltf.scene;


            if (this.model) {
                console.log(`Removing old model (UUID: ${this.model.uuid})`);
                this.scene.remove(this.model);
                this.model.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        // Важно: если this.defaultMaterial - это один и тот же объект,
                        // его НЕЛЬЗЯ очищать через child.material.dispose()!
                        // Если у каждого меша свой уникальный материал, то можно.
                        // Обычно материалы не очищают, если они могут переиспользоваться.
                    }
                });
                this.selectedMesh = null;
                this.meshNameEl.textContent = 'None'; // Обновляем UI
            }

            // 3. Обрабатываем новую модель (например, заменяем материалы)
            newModel.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.material = this.defaultMaterial;
                }
            });

            // 4. ДОБАВЛЯЕМ новую модель на сцену
            this.scene.add(newModel);

            this.model = newModel;
            // Автоматически настраиваем камеру, чтобы модель была в кадре.
            this.frameArea(this.model);
            return true

        } catch (error) {
            console.error("Failed to load model:", error);
            return false
        }
    }
    
    private frameArea(object: THREE.Object3D): void {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Вычисляем максимальный размер объекта, чтобы камера была достаточно далеко
        const maxSize = Math.max(size.x, size.y, size.z);
        const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * this.camera.fov / 360));
        const fitWidthDistance = fitHeightDistance / this.camera.aspect;
        const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

        const direction = new THREE.Vector3()
            .subVectors(this.camera.position, center)
            .normalize()
            .multiplyScalar(distance);

        this.camera.position.copy(center).add(direction);
        this.camera.near = distance / 100;
        this.camera.far = distance * 100;
        this.camera.updateProjectionMatrix();

        // Направляем OrbitControls на центр объекта
        this.controls.target.copy(center);
        this.controls.update();
    }

    private animate = (): void => {
        requestAnimationFrame(this.animate);

        this.tweenGroup.update();
        this.controls.update(); // <--- ДОБАВЬТЕ ЭТУ СТРОКУ

        this.updateLabels(); // Эта строка вызовет следующую ошибку, сейчас исправим
        this.renderer.render(this.scene, this.camera);
    }
}

(async () => {
    // 1. Сначала синхронно создаем объект (строится "дом" по чертежу)
    const editor = new AssemblyEditor();

    // 2. Затем асинхронно его инициализируем (проверяем сессию, загружаем данные)
    await editor.initialize();
})();