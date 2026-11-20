# Un Ai

Создай проект "un-ai" — умный голосовой ассистент клиники «Ак-Жол» на русском и кыргызском языках.

В приложении должен быть интерактивный Neo-Audio Cockpit (акустическая сфера с визуализацией голоса, переключение RU/KY, чат и пульт Smart Reception). 

Подключи базу данных PostgreSQL (Lovable Cloud) и реализуй:
1. Таблицы базы данных:
- doctors (врачи, специальности, кабинеты, статус)
- schedule_slots (слоты расписания, дата, время, статус: available, booked)
- appointments (записи пациентов: ФИО, телефон, врач, слот, жалобы/симптомы, статус)
- call_logs (история звонков/диалогов с ассистентом, распознанные сущности, резюме)

2. Edge Functions (API для Function Calling голосового ассистента):
- check-availability: проверка свободных слотов по врачу/специальности и дате
- create-booking: бронирование слота и создание записи пациента с защитой от овербукинга
- cancel-booking: отмена записи и освобождение слота

3. Интерфейс:
- Главный кокпит с визуализатором сферы, быстрым вводом, переключением языков и демо-диалогом
- Пульт администратора ресепшена со списком врачей, интерактивным календарем слотов и журналом подтвержденных записей в реальном времени

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://un-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8542f075-cc14-470f-993c-e950cf603800).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
