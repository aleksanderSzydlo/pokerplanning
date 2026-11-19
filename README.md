# Planning Poker

Prosta aplikacja do Planning Pokera dla zespołu. Działa jako statyczna strona (HTML/CSS/JS) hostowana na GitHub Pages, a wspólny stan sesji (uczestnicy, zadania, głosy) jest synchronizowany w czasie rzeczywistym przez Firebase Firestore.

## Funkcje

- Utworzenie sesji: nazwa, liczba uczestników (1–30) i ich imiona.
- Uczestnicy dołączają przez link i wybierają swoje imię (jedna osoba = jeden slot).
- Dodawanie zadań, głosowanie kartami (0, 1, 2, 3, 5, 8, 13, 21, ?, ☕).
- Host odsłania głosy, widzi średnią, min/max i zgodność, ustala finalną estymację.
- Eksport wyników do CSV i JSON.

## Konfiguracja Firebase (jednorazowo)

1. Wejdź na [console.firebase.google.com](https://console.firebase.google.com) i utwórz projekt.
2. W projekcie dodaj aplikację webową (ikona `</>`) i skopiuj obiekt `firebaseConfig`.
3. Wklej wartości do [firebase-config.js](./firebase-config.js) (zastąp pola `WSTAW_...`).
4. Włącz bazę: **Build → Firestore Database → Create database** (tryb produkcyjny lub testowy).
5. Ustaw reguły z pliku [firestore.rules](./firestore.rules): w konsoli Firestore → **Rules** → wklej zawartość i **Publish**.

Uwaga: aplikacja nie ma logowania. Każdy, kto ma link do sesji, może ją czytać i zmieniać. ID sesji jest losowe (8 znaków), ale to nie jest mechanizm bezpieczeństwa. Do danych wrażliwych nie nadaje się bez dodania uwierzytelniania.

## Publikacja na GitHub Pages

1. Wypchnij repo na `main`.
2. W GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow [pages.yml](./.github/workflows/pages.yml) wdroży stronę po każdym pushu na `main`.
4. Adres: `https://aleksanderszydlo.github.io/pokerplanning/`.
5. Jeśli Firebase blokuje domenę, dodaj ją w **Authentication → Settings → Authorized domains** (dla samego Firestore nie jest to wymagane).

## Lokalne uruchomienie

Nie ma etapu budowania. Wystarczy serwer statyczny w katalogu repo, np.:

```powershell
python -m http.server 8080
```

i otwórz `http://localhost:8080`.

## Struktura

- [index.html](./index.html): szkielet strony.
- [app.js](./app.js): routing, logika sesji, synchronizacja z Firestore, eksport.
- [styles.css](./styles.css): style.
- [firebase-config.js](./firebase-config.js): konfiguracja Firebase.
- [assets/softwareone-logo-rev.svg](./assets/softwareone-logo-rev.svg): logo SoftwareOne (Pickit).
