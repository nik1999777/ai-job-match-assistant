from pydantic import BaseModel


class EvalCase(BaseModel):
    id: int
    description: str
    resume: str
    vacancy: str
    expected_match_range: tuple[float, float]
    expected_missing_skills: list[str]
    expected_seniority: str
    reference_advice: str


TEST_CASES: list[EvalCase] = [
    EvalCase(
        id=1,
        description="Python backend developer → ML Engineer (partial match, missing ML libs)",
        resume=(
            "3 года опыта Python, FastAPI, PostgreSQL, Redis.\n"
            "Разрабатывал REST API для fintech стартапа.\n"
            "Знаю SQLAlchemy, Docker, Git.\n"
            "Образование: МГТУ, Прикладная математика."
        ),
        vacancy=(
            "ML Engineer в AI Lab.\n"
            "Требования: Python, PyTorch, LangChain, Qdrant, опыт с LLM.\n"
            "Будете строить pipeline для обработки NLP задач.\n"
            "Опыт от 2 лет в ML обязателен."
        ),
        expected_match_range=(0.10, 0.40),
        expected_missing_skills=["pytorch", "langchain", "qdrant"],
        expected_seniority="middle",
        reference_advice=(
            "Сильные стороны: Python и backend опыт — хорошая база для ML Engineer.\n"
            "Основные пробелы: нет опыта с PyTorch, LangChain и векторными БД (Qdrant).\n"
            "Рекомендации: пройди курс по PyTorch (fast.ai), "
            "изучи LangChain через документацию, "
            "разверни Qdrant локально и построй простой RAG pipeline как pet-проект."
        ),
    ),
    EvalCase(
        id=2,
        description="Senior frontend developer → Senior Frontend role (strong match, near-perfect skill overlap)",
        resume=(
            "6 лет frontend разработки.\n"
            "TypeScript, React, Next.js, Redux, GraphQL.\n"
            "Архитектировал micro-frontend решения для e-commerce платформы.\n"
            "Оптимизировал Core Web Vitals до 95+ в Lighthouse.\n"
            "Менторил команду из 3 junior разработчиков."
        ),
        vacancy=(
            "Senior Frontend Engineer.\n"
            "Требования: React, TypeScript, Next.js, опыт с GraphQL.\n"
            "Ведение архитектурных решений, менторинг junior разработчиков.\n"
            "Опыт от 5 лет."
        ),
        # match_score is skill-overlap only; all 4 vacancy skills are present → can reach 1.0
        expected_match_range=(0.60, 1.0),
        expected_missing_skills=[],
        expected_seniority="senior",
        reference_advice=(
            "Отличное совпадение — весь стек и опыт соответствуют требованиям.\n"
            "Твой опыт с micro-frontend архитектурой и менторингом прямо покрывает ожидания.\n"
            "Рекомендации: на собеседовании акцентируй конкретные кейсы оптимизации "
            "производительности и архитектурные решения с trade-off обоснованием."
        ),
    ),
    EvalCase(
        id=3,
        description="Junior developer → Senior Full-Stack (skill overlap moderate, seniority gap critical)",
        resume=(
            "1 год коммерческого опыта.\n"
            "JavaScript, React, базовый Node.js.\n"
            "Разработал 2 учебных проекта: todo-app и простой чат.\n"
            "Изучаю TypeScript самостоятельно."
        ),
        vacancy=(
            "Senior Full-Stack Engineer.\n"
            "Требования: TypeScript, React, Node.js, PostgreSQL, системное проектирование.\n"
            "Проведение технических интервью, принятие архитектурных решений.\n"
            "Опыт от 5 лет."
        ),
        # Skill overlap (React, Node.js) gives moderate score; seniority gap is captured separately
        expected_match_range=(0.20, 0.60),
        expected_missing_skills=["typescript", "postgresql"],
        expected_seniority="junior",
        reference_advice=(
            "Уровень требований значительно превышает текущий опыт — не рекомендуется подавать.\n"
            "Пробелы: TypeScript (в процессе изучения — хорошо), PostgreSQL, системный дизайн.\n"
            "Рекомендации: сосредоточься на junior/middle позициях, "
            "изучи TypeScript и PostgreSQL в рамках реальных задач, "
            "через 2-3 года вернись к senior вакансиям."
        ),
    ),
    EvalCase(
        id=4,
        description="DevOps/SRE engineer → DevOps role (strong match, OR-condition in CI/CD)",
        resume=(
            "4 года в DevOps и SRE.\n"
            "Kubernetes, Docker, Terraform, AWS, GitLab CI/CD.\n"
            "Настраивал мониторинг Prometheus + Grafana для 50+ микросервисов.\n"
            "Поддерживал 99.9% uptime для production сервисов."
        ),
        vacancy=(
            "DevOps Engineer.\n"
            "Требования: Kubernetes, Docker, CI/CD (GitLab или GitHub Actions), Terraform.\n"
            "Инфраструктура на AWS. Опыт с мониторингом Prometheus/Grafana обязателен."
        ),
        expected_match_range=(0.65, 0.95),
        # GitLab CI/CD covers "GitLab или GitHub Actions" — semantic matching handles this correctly
        expected_missing_skills=[],
        expected_seniority="middle",
        reference_advice=(
            "Очень высокое совпадение — весь стек покрыт с запасом.\n"
            "K8s, Docker, Terraform, AWS, GitLab CI/CD, Prometheus/Grafana — всё есть.\n"
            "Рекомендации: подготовь конкретные кейсы про SRE практики, "
            "инциденты и как удерживал uptime — это главный сигнал для интервьюера."
        ),
    ),
    EvalCase(
        id=5,
        description="Data Analyst → Data Scientist (missing core ML libraries)",
        resume=(
            "2 года Data Analyst.\n"
            "Python (pandas, matplotlib, numpy), SQL, Tableau.\n"
            "Строил дашборды и отчёты для бизнес-метрик.\n"
            "Базовая статистика: A/B тесты, корреляционный анализ."
        ),
        vacancy=(
            "Data Scientist.\n"
            "Требования: Python, scikit-learn, PyTorch или TensorFlow.\n"
            "Опыт построения и деплоя ML моделей. Работа с NLP задачами."
        ),
        expected_match_range=(0.10, 0.45),
        expected_missing_skills=["scikit-learn", "pytorch"],
        expected_seniority="junior",
        reference_advice=(
            "Хорошая аналитическая база, но есть пробелы в ML инженерии.\n"
            "Пробелы: scikit-learn, PyTorch/TensorFlow, MLOps (деплой моделей в прод).\n"
            "Рекомендации: изучи scikit-learn для классических ML алгоритмов, "
            "пройди практический курс по Deep Learning (fast.ai), "
            "задеплой пет-проект с моделью через FastAPI + Docker."
        ),
    ),
    EvalCase(
        id=6,
        description="Full-stack Python/React developer → Python Backend (good match)",
        resume=(
            "3.5 года full-stack разработки.\n"
            "Python (FastAPI, Django), React, TypeScript.\n"
            "PostgreSQL, Redis, RabbitMQ. Asyncio.\n"
            "Docker, базовый AWS и Kubernetes."
        ),
        vacancy=(
            "Python Backend Developer (middle/senior).\n"
            "Требования: Python, FastAPI или Django, PostgreSQL, Redis.\n"
            "Опыт с asyncio. Docker. Опыт от 3 лет."
        ),
        expected_match_range=(0.60, 0.90),
        expected_missing_skills=[],
        expected_seniority="middle",
        reference_advice=(
            "Хорошее совпадение — весь backend стек присутствует.\n"
            "Python, FastAPI/Django, PostgreSQL, Redis, asyncio, Docker — всё есть.\n"
            "Рекомендации: акцентируй asyncio опыт и работу с message broker (RabbitMQ) — "
            "это покажет зрелость backend экспертизы."
        ),
    ),
    EvalCase(
        id=7,
        description="UX Designer → ML Engineer (completely irrelevant, near-zero match)",
        resume=(
            "5 лет UX/UI дизайна.\n"
            "Figma, Adobe XD, Sketch. Прототипирование и user research.\n"
            "Провела 50+ юзабилити-тестов. Работала с Agile командами.\n"
            "Понимаю HTML/CSS на базовом уровне."
        ),
        vacancy=(
            "ML Engineer.\n"
            "Требования: Python, PyTorch, LangChain, опыт с LLM и RAG.\n"
            "Fine-tuning моделей, деплой через vLLM. Опыт от 3 лет в ML обязателен."
        ),
        expected_match_range=(0.00, 0.10),
        expected_missing_skills=["python", "pytorch", "langchain"],
        expected_seniority="senior",
        reference_advice=(
            "Стек кандидата не пересекается с требованиями вакансии.\n"
            "Дизайн и ML — разные специализации. Переход потребует 1-2 года обучения.\n"
            "Рекомендации: если интересен ML — начни с Python и курса по ML, "
            "рассмотри позиции UX в AI/ML продуктах как промежуточный шаг."
        ),
    ),
    EvalCase(
        id=8,
        description="Russian ML engineer → LLM Engineer role (target persona for this project)",
        resume=(
            "4 года в ML и NLP.\n"
            "Python, PyTorch, HuggingFace Transformers, scikit-learn.\n"
            "Fine-tuning LLM (LoRA/PEFT), деплой через FastAPI.\n"
            "Опыт с LangChain, работал с OpenAI API и локальными моделями (Ollama).\n"
            "PostgreSQL, Docker, Git. Базовый Kubernetes."
        ),
        vacancy=(
            "LLM Engineer / AI Engineer.\n"
            "Требования: Python, LangChain или LangGraph, опыт с LLM (fine-tuning, prompting).\n"
            "Qdrant или другие векторные БД. FastAPI. Понимание RAG архитектур.\n"
            "Опыт от 3 лет в ML/NLP."
        ),
        expected_match_range=(0.55, 0.90),
        expected_missing_skills=["qdrant", "langgraph"],
        expected_seniority="middle",
        reference_advice=(
            "Сильный профиль — большинство ключевых требований покрыто.\n"
            "LangChain, PyTorch, LoRA, FastAPI — прямое попадание в стек.\n"
            "Пробелы: Qdrant (векторная БД), LangGraph (оркестрация агентов).\n"
            "Рекомендации: разверни Qdrant локально и построй RAG pipeline, "
            "изучи LangGraph через официальную документацию — займёт 1-2 недели."
        ),
    ),
]
