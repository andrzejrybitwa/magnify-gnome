# Windows Style Magnifier dla GNOME Shell (Ubuntu / Wayland / X11)

Lekkie, niezależne rozszerzenie do GNOME Shell (wersja 46+), które emuluje działanie okienkowej lupy znanej z systemu Windows.

### Funkcje:
* **Oddokowane, pływające okno:** Możesz je swobodnie przesuwać po całym ekranie za pomocą paska tytułowego.
* **Przezroczystość kontekstowa:** Lupa widzi i powiększa to, co znajduje się bezpośrednio pod nią (brak szarych plam i efektu lustra w lustrze).
* **Płynna zmiana rozmiaru:** Uchwyt w prawym dolnym rogu (`◢`) pozwala rozciągać okno w pionie i poziomie.
* **Kontrolki na pasku:** Przyciski `-`, `+`, `X` oraz widoczny, skalowany kursor myszy wewnątrz lupy.
* **Śledzenie tekstu:** Automatycznie podąża za kursorem tekstowym podczas pisania na klawiaturze.
* **Zapamiętywanie ustawień:** Automatycznie zapisuje pozycję, rozmiar oraz poziom powiększenia.

### Instalacja ręczna na Ubuntu:
1. Sklonuj lub pobierz repozytorium do folderu rozszerzeń GNOME:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/win-magnifier@local
   # Skopiuj pliki metadata.json, extension.js oraz cursor.svg do tego folderu

  sudo apt install -y gir1.2-atspi-2.0
gsettings set org.gnome.desktop.interface toolkit-accessibility true```

