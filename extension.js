import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import IBus from 'gi://IBus';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class WinMagnifierExtension extends Extension {
    enable() {
        this._configPath = GLib.build_filenamev([GLib.get_user_config_dir(), 'win-magnifier-settings.json']);
        this._cursorSvgPath = GLib.build_filenamev([this.path, 'cursor.svg']);

        this._x = 250;
        this._y = 180;
        this._w = 450;
        this._h = 320;
        this._zoom = 2.5;
        this._wasOpen = true;
        this._isActive = false;

        this._loadSettings();

        this._targetX = 0;
        this._targetY = 0;
        this._lastMouseX = -1;
        this._lastMouseY = -1;

        this._indicator = new PanelMenu.Button(0.0, 'Windows Magnifier', false);
        let iconLabel = new St.Label({
            text: ' 🔍 Lupa ',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-weight: bold;'
        });
        this._indicator.add_child(iconLabel);
        this._indicator.connect('button-press-event', () => {
            if (this._isActive) {
                this._wasOpen = false;
                this._saveSettings();
                this._stopMagnifier();
            } else {
                this._wasOpen = true;
                this._saveSettings();
                this._startMagnifier();
            }
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea('win-magnifier-indicator', this._indicator);

        if (this._wasOpen) {
            this._startMagnifier();
        }
    }

    _loadSettings() {
        try {
            if (GLib.file_test(this._configPath, GLib.FileTest.EXISTS)) {
                let [ok, contents] = GLib.file_get_contents(this._configPath);
                if (ok) {
                    let decoder = new TextDecoder('utf-8');
                    let data = JSON.parse(decoder.decode(contents));
                    if (typeof data.x === 'number') this._x = Math.max(0, data.x);
                    if (typeof data.y === 'number') this._y = Math.max(34, data.y);
                    if (typeof data.w === 'number') this._w = Math.max(220, data.w);
                    if (typeof data.h === 'number') this._h = Math.max(140, data.h);
                    if (typeof data.zoom === 'number') this._zoom = Math.max(1.5, Math.min(10.0, data.zoom));
                    if (typeof data.wasOpen === 'boolean') this._wasOpen = data.wasOpen;
                }
            }
        } catch (e) {
            console.error('Blad odczytu ustawien lupy:', e);
        }
    }

    _saveSettings() {
        try {
            let data = {
                x: this._x,
                y: this._y,
                w: this._w,
                h: this._h,
                zoom: this._zoom,
                wasOpen: this._wasOpen
            };
            GLib.file_set_contents(this._configPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Blad zapisu ustawien lupy:', e);
        }
    }

    _startMagnifier() {
        if (this._isActive) return;
        this._isActive = true;

        let [mx, my] = global.get_pointer();
        this._targetX = mx;
        this._targetY = my;
        this._lastMouseX = mx;
        this._lastMouseY = my;

        this._titleBar = new St.BoxLayout({
            style: 'background-color: #e5e5e5; border: 2px solid #444; border-bottom: none; padding: 2px 8px;',
            reactive: true,
            x: this._x,
            y: this._y - 34,
            width: this._w,
            height: 34
        });

        this._titleLabel = new St.Label({
            text: `Lupa (${this._zoom.toFixed(1)}x)`,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style: 'color: #111; font-weight: bold; font-size: 13px;'
        });

        let btnMinus = new St.Button({
            label: ' - ',
            reactive: true,
            style: 'background-color: #ccc; color: #000; font-weight: bold; margin-right: 4px; padding: 2px 10px; border-radius: 3px;'
        });
        let btnPlus = new St.Button({
            label: ' + ',
            reactive: true,
            style: 'background-color: #ccc; color: #000; font-weight: bold; margin-right: 8px; padding: 2px 10px; border-radius: 3px;'
        });
        let btnClose = new St.Button({
            label: ' X ',
            reactive: true,
            style: 'background-color: #d9534f; color: #fff; font-weight: bold; padding: 2px 10px; border-radius: 3px;'
        });

        btnMinus.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) this._changeZoom(-0.5);
            return Clutter.EVENT_STOP;
        });
        btnPlus.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) this._changeZoom(0.5);
            return Clutter.EVENT_STOP;
        });
        btnClose.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._wasOpen = false;
                this._saveSettings();
                this._stopMagnifier();
            }
            return Clutter.EVENT_STOP;
        });

        this._titleBar.add_child(this._titleLabel);
        this._titleBar.add_child(btnMinus);
        this._titleBar.add_child(btnPlus);
        this._titleBar.add_child(btnClose);

        this._viewport = new St.Widget({
            style: 'border: 2px solid #444; background-color: #000;',
            clip_to_allocation: true,
            reactive: false,
            x: this._x,
            y: this._y,
            width: this._w,
            height: this._h
        });

        this._clone = new Clutter.Clone({
            source: Main.layoutManager.uiGroup
        });
        this._viewport.add_child(this._clone);

        let cursorFile = Gio.File.new_for_path(this._cursorSvgPath);
        this._cursorDot = new St.Icon({
            gicon: new Gio.FileIcon({ file: cursorFile }),
            reactive: false
        });
        this._viewport.add_child(this._cursorDot);
        this._updateCursorAppearance();

        this._resizeVisual = new St.Label({
            text: '◢',
            reactive: false,
            style: 'color: #222; background-color: rgba(229, 229, 229, 0.9); border-top: 1px solid #444; border-left: 1px solid #444; font-size: 14px; padding: 0px 3px;',
            x: this._x + this._w - 22,
            y: this._y + this._h - 22,
            width: 22,
            height: 22
        });

        this._resizeHandle = new St.Label({
            text: '◢',
            reactive: true,
            style: 'color: #222; background-color: rgba(229, 229, 229, 0.9); border-top: 1px solid #444; border-left: 1px solid #444; font-size: 14px; padding: 0px 3px;',
            x: this._x + this._w - 22,
            y: this._y + this._h - 22,
            width: 22,
            height: 22
        });

        Main.layoutManager.uiGroup.add_child(this._titleBar);
        Main.layoutManager.uiGroup.add_child(this._resizeVisual);
        global.stage.add_child(this._viewport);
        global.stage.add_child(this._resizeHandle);

        this._dragging = false;
        this._resizing = false;

        this._barPressId = this._titleBar.connect('button-press-event', (actor, event) => {
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
            let source = event.get_source();
            if (source === btnMinus || source === btnPlus || source === btnClose) {
                return Clutter.EVENT_PROPAGATE;
            }
            this._dragging = true;
            let [stageX, stageY] = event.get_coords();
            this._dragOffsetX = stageX - this._x;
            this._dragOffsetY = stageY - this._y;
            return Clutter.EVENT_STOP;
        });

        this._resizePressId = this._resizeHandle.connect('button-press-event', (actor, event) => {
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
            this._resizing = true;
            let [stageX, stageY] = event.get_coords();
            this._resizeStartX = stageX;
            this._resizeStartY = stageY;
            this._startW = this._w;
            this._startH = this._h;
            return Clutter.EVENT_STOP;
        });

        this._stageEventId = global.stage.connect('captured-event', (actor, event) => {
            if (!this._dragging && !this._resizing) return Clutter.EVENT_PROPAGATE;
            let type = event.type();

            if (type === Clutter.EventType.MOTION) {
                let state = event.get_state();
                if (!(state & Clutter.ModifierType.BUTTON1_MASK)) {
                    this._dragging = false;
                    this._resizing = false;
                    this._saveSettings();
                    return Clutter.EVENT_PROPAGATE;
                }

                let [stageX, stageY] = event.get_coords();
                if (this._dragging) {
                    this._x = Math.max(0, Math.round(stageX - this._dragOffsetX));
                    this._y = Math.max(34, Math.round(stageY - this._dragOffsetY));
                    this._updateWindowGeometry();
                } else if (this._resizing) {
                    this._w = Math.max(220, Math.round(this._startW + (stageX - this._resizeStartX)));
                    this._h = Math.max(140, Math.round(this._startH + (stageY - this._resizeStartY)));
                    this._updateWindowGeometry();
                    this._updateMagnifierView();
                }
                return Clutter.EVENT_STOP;
            } else if (type === Clutter.EventType.BUTTON_RELEASE) {
                this._dragging = false;
                this._resizing = false;
                this._saveSettings();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._setupIBusTracking();
        this._setupCaretTracking();

        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (!this._isActive) return GLib.SOURCE_REMOVE;
            this._checkMouseMovement();
            this._updateMagnifierView();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _updateCursorAppearance() {
        if (!this._cursorDot) return;
        let cursorSize = Math.round(26 * this._zoom);
        this._cursorDot.set_icon_size(cursorSize);
        this._cursorDot.set_size(cursorSize, cursorSize);

        let tipOffset = Math.round((2 / 32) * cursorSize);
        this._cursorDot.set_position(
            Math.round(this._w / 2) - tipOffset,
            Math.round(this._h / 2) - tipOffset
        );
    }

    _setupIBusTracking() {
        try {
            let im = Main.inputMethod;
            if (im) {
                this._imCursorId = im.connect('cursor-location-changed', (method, rect) => {
                    if (rect && (rect.get_x() > 0 || rect.get_y() > 0)) {
                        this._targetX = rect.get_x() + Math.round(rect.get_width() / 2);
                        this._targetY = rect.get_y() + Math.round(rect.get_height() / 2);
                    }
                });
            }

            IBus.init();
            this._ibusBus = new IBus.Bus();
            if (this._ibusBus.is_connected()) {
                this._ibusConnectSignals();
            } else {
                this._ibusConnId = this._ibusBus.connect('connected', () => this._ibusConnectSignals());
            }
        } catch (e) {
            console.error('IBus tracking error:', e);
        }
    }

    _ibusConnectSignals() {
        try {
            this._ibusSubId = this._ibusBus.get_connection().signal_subscribe(
                null,
                'org.freedesktop.IBus.Panel',
                'SetCursorLocation',
                null,
                null,
                Gio.DBusSignalFlags.NONE,
                (conn, sender, path, iface, signal, params) => {
                    let [x, y, w, h] = params.deep_unpack();
                    if (x > 0 || y > 0) {
                        this._targetX = x + Math.round(w / 2);
                        this._targetY = y + Math.round(h / 2);
                    }
                }
            );
        } catch (e) {}
    }

    async _setupCaretTracking() {
        try {
            const Atspi = (await import('gi://Atspi')).default;
            const CaretTracker = await import('resource:///org/gnome/shell/ui/caretTracker.js');

            this._atspi = Atspi;
            this._focusCaretTracker = new CaretTracker.FocusCaretTracker();

            this._caretMovedId = this._focusCaretTracker.connect('caret-moved', () => {
                this._onAtspiCaretMoved();
            });
            this._focusChangedId = this._focusCaretTracker.connect('focus-changed', () => {
                this._onAtspiFocusChanged();
            });

            this._focusCaretTracker.registerCaretListener();
            this._focusCaretTracker.registerFocusListener();
        } catch (e) {
            console.error('AT-SPI error:', e);
        }
    }

    _translateCoords(extents) {
        if (!extents) return null;
        let x = extents.x;
        let y = extents.y;
        let w = extents.width;
        let h = extents.height;

        if (x === 0 && y === 0 && w === 0 && h === 0) return null;

        let win = global.display.get_focus_window();
        if (win) {
            let rect = win.get_frame_rect();
            if (x < rect.x || y < rect.y) {
                x += rect.x;
                y += rect.y;
            }
        }
        return {
            x: x + Math.round(w / 2),
            y: y + Math.round(h / 2)
        };
    }

    _onAtspiCaretMoved() {
        if (!this._focusCaretTracker || !this._focusCaretTracker._accessible || !this._atspi) return;
        try {
            let acc = this._focusCaretTracker._accessible;
            let text = acc.get_text_iface();
            if (!text) return;

            let offset = text.get_caret_offset();
            let extents = text.get_character_extents(offset, this._atspi.CoordType.WINDOW);
            if ((!extents || (extents.x === 0 && extents.y === 0)) && offset > 0) {
                extents = text.get_character_extents(offset - 1, this._atspi.CoordType.WINDOW);
            }

            let pt = this._translateCoords(extents);
            if (pt) {
                this._targetX = pt.x;
                this._targetY = pt.y;
                return;
            }

            let comp = acc.get_component_iface();
            if (comp) {
                let compExt = comp.get_extents(this._atspi.CoordType.WINDOW);
                let compPt = this._translateCoords(compExt);
                if (compPt) {
                    this._targetX = compPt.x;
                    this._targetY = compPt.y;
                }
            }
        } catch (e) {}
    }

    _onAtspiFocusChanged() {
        if (!this._focusCaretTracker || !this._focusCaretTracker._accessible || !this._atspi) return;
        try {
            let comp = this._focusCaretTracker._accessible.get_component_iface();
            if (!comp) return;
            let extents = comp.get_extents(this._atspi.CoordType.WINDOW);
            let pt = this._translateCoords(extents);
            if (pt) {
                this._targetX = pt.x;
                this._targetY = pt.y;
            }
        } catch (e) {}
    }

    _checkMouseMovement() {
        let [mx, my] = global.get_pointer();
        if (mx !== this._lastMouseX || my !== this._lastMouseY) {
            this._lastMouseX = mx;
            this._lastMouseY = my;
            this._targetX = mx;
            this._targetY = my;
        }
    }

    _updateWindowGeometry() {
        if (this._titleBar) {
            this._titleBar.set_position(this._x, this._y - 34);
            this._titleBar.set_width(this._w);
        }
        if (this._viewport) {
            this._viewport.set_position(this._x, this._y);
            this._viewport.set_size(this._w, this._h);
        }
        this._updateCursorAppearance();
        if (this._resizeVisual) {
            this._resizeVisual.set_position(this._x + this._w - 22, this._y + this._h - 22);
        }
        if (this._resizeHandle) {
            this._resizeHandle.set_position(this._x + this._w - 22, this._y + this._h - 22);
        }
    }

    _updateMagnifierView() {
        this._clone.set_scale(this._zoom, this._zoom);

        let cloneX = Math.round((this._w / 2) - (this._targetX * this._zoom));
        let cloneY = Math.round((this._h / 2) - (this._targetY * this._zoom));
        this._clone.set_position(cloneX, cloneY);
    }

    _changeZoom(delta) {
        this._zoom = Math.max(1.5, Math.min(10.0, this._zoom + delta));
        if (this._titleLabel) {
            this._titleLabel.set_text(`Lupa (${this._zoom.toFixed(1)}x)`);
        }
        this._updateCursorAppearance();
        this._updateMagnifierView();
        this._saveSettings();
    }

    _stopMagnifier() {
        this._isActive = false;
        this._dragging = false;
        this._resizing = false;

        if (this._imCursorId && Main.inputMethod) {
            Main.inputMethod.disconnect(this._imCursorId);
            this._imCursorId = null;
        }
        if (this._ibusSubId && this._ibusBus) {
            try {
                this._ibusBus.get_connection().signal_unsubscribe(this._ibusSubId);
            } catch (e) {}
            this._ibusSubId = null;
        }
        if (this._ibusConnId && this._ibusBus) {
            this._ibusBus.disconnect(this._ibusConnId);
            this._ibusConnId = null;
        }
        this._ibusBus = null;

        if (this._focusCaretTracker) {
            try {
                if (this._caretMovedId) {
                    this._focusCaretTracker.disconnect(this._caretMovedId);
                    this._caretMovedId = null;
                }
                if (this._focusChangedId) {
                    this._focusCaretTracker.disconnect(this._focusChangedId);
                    this._focusChangedId = null;
                }
                this._focusCaretTracker.deregisterCaretListener();
                this._focusCaretTracker.deregisterFocusListener();
            } catch (e) {}
            this._focusCaretTracker = null;
        }

        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = null;
        }
        if (this._barPressId && this._titleBar) {
            this._titleBar.disconnect(this._barPressId);
            this._barPressId = null;
        }
        if (this._resizePressId && this._resizeHandle) {
            this._resizeHandle.disconnect(this._resizePressId);
            this._resizePressId = null;
        }
        if (this._titleBar) {
            Main.layoutManager.uiGroup.remove_child(this._titleBar);
            this._titleBar.destroy();
            this._titleBar = null;
        }
        if (this._resizeVisual) {
            Main.layoutManager.uiGroup.remove_child(this._resizeVisual);
            this._resizeVisual.destroy();
            this._resizeVisual = null;
        }
        if (this._viewport) {
            global.stage.remove_child(this._viewport);
            this._viewport.destroy();
            this._viewport = null;
        }
        if (this._resizeHandle) {
            global.stage.remove_child(this._resizeHandle);
            this._resizeHandle.destroy();
            this._resizeHandle = null;
        }
    }

    disable() {
        this._stopMagnifier();
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
