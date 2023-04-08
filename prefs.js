const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, GdkPixbuf, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

function init() {
    ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
    if (!iconTheme.get_search_path().includes(Me.path + "/media"))
        iconTheme.add_search_path(Me.path + "/media");

    const settings = ExtensionUtils.getSettings();

    window.can_navigate_back = true;

    const homePage = new HomePage(settings);
    window.add(homePage);
}

var HomePage = GObject.registerClass(
class azWallpaper_HomePage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: _("Settings"),
            icon_name: 'preferences-system-symbolic',
            name: 'HomePage'
        });

        this._settings = settings;

        let slideShowGroup = new Adw.PreferencesGroup({
            title: _('Slideshow Options')
        });
        this.add(slideShowGroup);

        let slideShowDirRow = new Adw.ActionRow({
            title: _("Slideshow Directory"),
            subtitle: this._settings.get_string('slideshow-directory'),
        });
        let fileChooserButton = this.createFileChooserButton('slideshow-directory', slideShowDirRow);
        let openDirectoryButton = this.createOpenDirectoyButton(this._settings.get_string('slideshow-directory'));
        slideShowDirRow.add_prefix(openDirectoryButton);
        slideShowDirRow.add_suffix(fileChooserButton);
        slideShowGroup.add(slideShowDirRow);

        let imageDurationRow = this.createSpinRow(_('Image Duration (seconds)'), 'slideshow-image-duration', 5, 600);
        slideShowGroup.add(imageDurationRow);

        let preserveQueueTypes = new Gtk.StringList();
        preserveQueueTypes.append(_('Session'));
        preserveQueueTypes.append(_('Permanent'));
        let slideShowPreserveQueueRow = new Adw.ComboRow({
            title: _('Preserve Slideshow Queue'),
            model: preserveQueueTypes,
            selected: this._settings.get_enum('slideshow-preserve-queue')
        });
        slideShowPreserveQueueRow.connect("notify::selected", (widget) => {
            this._settings.set_enum('slideshow-preserve-queue', widget.selected);
        });
        slideShowGroup.add(slideShowPreserveQueueRow);

        let bingDlSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('bing-wallpaper-download')
        });
        bingDlSwitch.connect('notify::active', (widget) => {
            this._settings.set_boolean('bing-wallpaper-download', widget.get_active());
        });

        let bingDLGroup = new Adw.PreferencesGroup({
            title: _('Download BING wallpaper of the day'),
            header_suffix: bingDlSwitch
        });
        this.add(bingDLGroup);

        let bingDlRow = new Adw.ActionRow({
            title: _('BING Download Directory'),
            subtitle: this._settings.get_string('bing-download-directory'),
        });
        fileChooserButton = this.createFileChooserButton('bing-download-directory', bingDlRow);
        openDirectoryButton = this.createOpenDirectoyButton(this._settings.get_string('bing-download-directory'));
        bingDlRow.add_suffix(fileChooserButton);
        bingDlRow.add_prefix(openDirectoryButton);
        bingDLGroup.add(bingDlRow);

        let debugLogsGroup = new Adw.PreferencesGroup({
            title: _('Debug Mode')
        });
        this.add(debugLogsGroup);

        let debugLogsSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('debug-logs')
        });
        debugLogsSwitch.connect('notify::active', (widget) => {
            this._settings.set_boolean('debug-logs', widget.get_active());
        });
        let debugLogsRow = new Adw.ActionRow({
            title: _('Enable Logs'),
            activatable_widget: debugLogsSwitch
        });
        debugLogsRow.add_suffix(debugLogsSwitch);
        debugLogsGroup.add(debugLogsRow);
    }

    createOpenDirectoyButton(directory) {
        const file = Gio.file_new_for_path(directory);
        const fileUri = file.get_uri();
        let button = new Gtk.Button({
            icon_name: 'folder-open-symbolic',
            tooltip_text: _('Open directory...'),
            valign: Gtk.Align.CENTER,
        });

        button.connect('clicked', (widget) => {
            Gtk.show_uri(this.get_root(), fileUri, Gdk.CURRENT_TIME);
        });

        return button;
    }

    createFileChooserButton(setting, parentRow) {
        let fileChooserButton = new Gtk.Button({
            icon_name: 'folder-new-symbolic',
            tooltip_text: _('Choose new directory...'),
            valign: Gtk.Align.CENTER,
        });

        fileChooserButton.connect('clicked', (widget) => {
            let dialog = new Gtk.FileChooserDialog({
                title: _('Select a directory'),
                transient_for: this.get_root(),
                action: Gtk.FileChooserAction.SELECT_FOLDER,
            });
            dialog.add_button("_Cancel", Gtk.ResponseType.CANCEL);
            dialog.add_button("_Select", Gtk.ResponseType.ACCEPT);

            dialog.connect("response", (self, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const filePath = dialog.get_file().get_path();
                    this._settings.set_string(setting, filePath),
                        parentRow.subtitle = filePath;
                    dialog.destroy();
                }
                else if (response === Gtk.ResponseType.CANCEL)
                    dialog.destroy();
            });
            dialog.show();
        });

        parentRow.activatable_widget = fileChooserButton;
        return fileChooserButton;
    }

    createSpinRow(title, setting, lower, upper) {
        const value = this._settings.get_int(setting);
        let spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower, upper, step_increment: 1, page_increment: 1, page_size: 0,
            }),
            climb_rate: 1,
            digits: 0,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
        spinButton.set_value(value);
        spinButton.connect('value-changed', (widget) => {
            this._settings.set_int(setting, widget.get_value());
        });
        let spinRow = new Adw.ActionRow({
            title: _(title),
            activatable_widget: spinButton
        });

        spinRow.setValue = (value) => {
            spinButton.set_value(value);
        }

        spinRow.add_suffix(spinButton);
        return spinRow;
    }
});