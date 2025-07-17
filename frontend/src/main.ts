import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
import { fetchGraphQL } from './api';
// --- Типы данных, соответствующие GraphQL схеме ---
interface Component {
    name: string;
    meshId: string;
}
interface AssemblyStep {
    stepNumber: number;
    actionType: string;
    component: Component;
}
interface AssemblyPlan {
    name: string;
    steps: AssemblyStep[];
    product: Product; // <--- ДОБАВЛЯЕМ ЭТО ПОЛЕ
}
interface AssemblyStep {
    stepNumber: number;
    actionType: string;
    component: Component;
}
interface Label {
    element: HTMLElement;
    target: THREE.Object3D; // К какому 3D-объекту "привязана" метка
}
interface Product {
    id: number;
    name: string;
    description?: string;
    modelPath?: string;
    modelUrl?: string;
}
// --- Основной класс приложения ---
class AssemblyApp {
    // 3D Сцена
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private model?: THREE.Group;
    private controls: OrbitControls;
    private tweenGroup: TWEEN.Group;
    // Данные и состояние
    private plan?: AssemblyPlan;
    private currentStepIndex = -1;


    // Материалы для визуализации
    private highlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff83, metalness: 0, roughness: 1, name: 'highlight' });
    private completedMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0, roughness: 0, name: 'completed' });
    private defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0, roughness: 0 });
    // UI Элементы

    private stepNumberEl: HTMLElement;
    private stepActionEl: HTMLElement;
    private nextStepBtn: HTMLElement;
    private labelsContainer: HTMLElement; // <--- Ссылка на контейнер
    private labels: Label[] = [];

    constructor() {
        // Инициализация UI элементов
        this.stepNumberEl = document.getElementById('step-number')!;
        this.stepActionEl = document.getElementById('step-action')!;
        this.nextStepBtn = document.getElementById('nextStepBtn')!;
        this.nextStepBtn.onclick = () => this.goToNextStep();
        this.labelsContainer = document.getElementById('labels-container')!;
        this.nextStepBtn = document.getElementById('nextStepBtn') as HTMLButtonElement;

        

        // Инициализация 3D
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1, // Эти значения потом будут пересчитаны
            10000 // Увеличим дальнюю плоскость, чтобы вместить большие координаты
        );
        this.tweenGroup = new TWEEN.Group();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Управление камерой и освещение
        // new OrbitControls(this.camera, this.renderer.domElement);
        // this.camera.position.set(1, 2, 3);
        // this.addLights();

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.camera.position.set(1000, 1500, 900); // Временное положение, мы его пересчитаем

        this.controls.update();

        this.addLights();
        this.addHelpers();

        // Запуск
        this.init();
        this.animate();
        window.addEventListener('resize', this.onWindowResize);
    }
    private async fetchPlanByComputerName(computerName: string): Promise<void> {
        // --- ЗАМЕНЯЕМ ЗАГЛУШКУ НА РЕАЛЬНЫЙ ЗАПРОС ---
        const query = `
        query GetPlanByComputer($computerName: String!) {
            assemblyPlanByComputerName(computerName: $computerName) {
                name
                steps {
                    stepNumber
                    actionType
                    component {
                        name
                        meshId
                    }
                }
                product {
                    name
                    modelPath
                }
            }
        }
    `;

        try {
            // Вызываем универсальную функцию. Она вернет либо данные, либо выбросит ошибку.
            const data = await fetchGraphQL(query, { computerName });

            this.plan = data.assemblyPlanByComputerName;

            // Проверяем, что бэкенд не вернул null (например, если станция не найдена)
            if (!this.plan) {
                throw new Error(`No assembly plan found for computer: ${computerName}`);
            }

        } catch (error) {
            console.error("Failed to fetch assembly plan:", error);
            // Просто отображаем ошибку, которую нам вернула fetchGraphQL
            if (error instanceof Error) {
                this.stepActionEl.innerText = `Error: ${error.message}`;
            }
        }
    }
    private async init() {
        // 1. Получаем имя станции из URL. Это точка входа.
        const urlParams = new URLSearchParams(window.location.search);
        const stationName = urlParams.get('station');

        // Если имя станции не указано, показываем ошибку и останавливаемся.
        if (!stationName) {
            this.stepActionEl.innerText = "Error: Workstation name not provided in URL.";
            return;
        }

        // 2. Запрашиваем с бэкенда план сборки и путь к модели по имени станции.
        await this.fetchPlanByComputerName(stationName);
        
        // 3. Проверяем, что бэкенд вернул нам все необходимые данные.
        if (this.plan && this.plan.product && this.plan.product.modelPath) {
            // Если все ОК, загружаем 3D-модель по полученному пути.
            const fullUrl = this.plan.product.modelPath;
            console.log(this.plan.product.modelPath);
            await this.loadModel(fullUrl);
        } else {
            // Если данных нет, показываем ошибку и останавливаемся.
            this.stepActionEl.innerText = "Error: Plan or model path not found for this station.";
            return;
        }

        // 4. Этот код выполнится, только если модель была успешно загружена.
        if (this.model) {
            // Настраиваем камеру, чтобы модель красиво поместилась в кадр.
            this.frameArea(this.model);
            // Показываем самый первый шаг инструкции.
            this.goToNextStep();
        }
    }
    private createLabel(targetObject: THREE.Object3D, text: string): void {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = text;
        this.labelsContainer.appendChild(labelDiv);

        this.labels.push({
            element: labelDiv,
            target: targetObject
        });
    }
    private clearLabels(): void {
        this.labels.forEach(label => this.labelsContainer.removeChild(label.element));
        this.labels = [];
    }
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
    private focusOnObject(targetObject: THREE.Object3D, duration: number = 750): void {
        if (!this.model) return;
        this.controls.enabled = false;

        // 1. Находим новую цель - центр выбранного объекта.
        const newTarget = new THREE.Vector3();
        new THREE.Box3().setFromObject(targetObject).getCenter(newTarget);

        // 2. Вычисляем желаемое расстояние до новой цели.
        const size = new THREE.Vector3();
        new THREE.Box3().setFromObject(targetObject).getSize(size);
        // Дистанция = (самый большой габарит объекта) * (коэффициент отдаления)
        const distance = Math.max(size.x, size.y, size.z) * 2; // Коэффициент 4 можно настроить

        // 3. Вычисляем новую позицию камеры.
        // Мы хотим сохранить текущее направление "относительно" центра мира,
        // чтобы камера не прыгала хаотично, а плавно облетала объект.
        const newCameraPosition = new THREE.Vector3();
        // Берем вектор от текущей цели к текущей камере, чтобы сохранить направление обзора
        newCameraPosition.subVectors(this.camera.position, this.controls.target);
        // Устанавливаем правильную длину этому вектору (дистанцию)
        newCameraPosition.setLength(distance);
        // Смещаем вектор так, чтобы он исходил из новой цели
        newCameraPosition.add(newTarget);

        // --- ЗАПУСКАЕМ АНИМАЦИИ ---

        // Анимация цели (точки, вокруг которой вращается камера)
        new TWEEN.Tween(this.controls.target, this.tweenGroup)
            .to(newTarget, duration)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();

        // Анимация самой камеры
        new TWEEN.Tween(this.camera.position, this.tweenGroup)
            .to(newCameraPosition, duration)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                this.controls.enabled = true;
                // После завершения анимации нужно принудительно обновить OrbitControls,
                // чтобы он "осознал" новое положение.
                this.controls.update();
            })
            .start();
    }
    private addHelpers(): void {
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
    }
    // frontend/src/main.ts

    private async loadModel(path: string): Promise<void> {
        const loader = new GLTFLoader();
        try {
            const fullUrl = `http://localhost:8000${path}`;
            console.log(`Attempting to load model from: ${fullUrl}`);
            const gltf = await loader.loadAsync(fullUrl);
            this.model = gltf.scene;

            // Проходим по всем дочерним элементам загруженной модели.
            this.model.traverse(child => {
                // Нас интересуют только видимые объекты (меши).
                if (child instanceof THREE.Mesh) {
                    // Выводим имя найденного объекта в консоль для отладки.
                    console.log(`Found mesh in 3D model with name: '${child.name}'`);

                    // Игнорируем все материалы из файла и принудительно 
                    // присваиваем наш стандартный "дефолтный" материал.
                    child.material = this.defaultMaterial;
                }
            });

            // Добавляем модель с уже измененными материалами на сцену.
            this.scene.add(this.model);

            // Автоматически настраиваем камеру, чтобы модель была в кадре.
            this.frameArea(this.model);

        } catch (error) {
            console.error("Failed to load model:", error);
            this.stepActionEl.innerText = "Error loading 3D model!";
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

    // --- НОВЫЙ МЕТОД ДЛЯ КОРРЕКТНОЙ РАБОТЫ ПРИ ИЗМЕНЕНИИ РАЗМЕРА ОКНА ---
    private onWindowResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    private goToNextStep(): void {
        if (!this.plan || !this.model) {
            return; // Защита, если план или модель не загружены
        }

        // 1. Пометить предыдущий шаг как выполненный (если он был валидным)
        if (this.currentStepIndex >= 0 && this.currentStepIndex < this.plan.steps.length) {
            const prevStep = this.plan.steps[this.currentStepIndex];
            const prevObject = this.model.getObjectByName(prevStep.component.meshId) as THREE.Mesh;
            if (prevObject) {
                prevObject.material = this.completedMaterial;
            }
        }

        // 2. Перейти к следующему шагу
        this.currentStepIndex++;

        // 3. Проверить, не закончилась ли сборка
        if (this.currentStepIndex >= this.plan.steps.length) {
            this.stepActionEl.innerText = "Assembly complete!";
            this.stepNumberEl.innerText = "✓";
            this.nextStepBtn.style.display = 'none'; // Скрываем кнопку
            return; // Завершаем выполнение функции
        }

        // 4. Обработать текущий шаг
        const currentStep = this.plan.steps[this.currentStepIndex];

        // Очищаем старые метки
        this.clearLabels();

        // Находим объект и подсвечиваем его
        const currentObject = this.model.getObjectByName(currentStep.component.meshId) as THREE.Mesh;
        if (currentObject) {
            currentObject.material = this.highlightMaterial;
            // Создаем для него новую метку
            this.createLabel(currentObject, currentStep.stepNumber.toString());
            this.focusOnObject(currentObject);
        } else {
            // Выводим ошибку, если объект не найден, чтобы было понятно в будущем
            console.error(`Could not find object with name: ${currentStep.component.meshId}`);
        }

        // 5. Обновить UI
        this.stepNumberEl.innerText = currentStep.stepNumber.toString();
        this.stepActionEl.innerText = `${currentStep.actionType}: ${currentStep.component.name}`;
    }
    private animate = (): void => {
        requestAnimationFrame(this.animate);
        // Обновляем позиции меток в каждом кадре
        this.tweenGroup.update();
        this.updateLabels();
        this.renderer.render(this.scene, this.camera);
    }
    private updateLabels(): void {
        if (!this.model) return;

        this.labels.forEach(label => {
            const position = new THREE.Vector3();
            // Получаем мировые координаты центра объекта
            label.target.getWorldPosition(position);

            // Проецируем 3D точку в 2D пространство экрана
            position.project(this.camera);

            // Проверяем, находится ли точка перед камерой
            const isBehindCamera = position.z > 1;

            if (isBehindCamera) {
                label.element.style.display = 'none';
            } else {
                label.element.style.display = 'block';

                // Переводим координаты из диапазона [-1, 1] в пиксели
                const x = (position.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
                const y = (position.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;

                label.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
            }
        });
    }
}

new AssemblyApp();