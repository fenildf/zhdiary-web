import $ from "jquery";
import tingle from "tingle.js";
import "bootstrap";
import flatpickr from "flatpickr";
import "./dbEditor.scss";
import { toTitle, fetchJSON } from "../util";
import Quill from "quill";

export interface IColumn {
    name: string;
    width: number;
    readOnly?: boolean;
    label?: string;
    type?: "one-line" |  "multi-line" | "html" | "number" | "datetime" | "list";
    newEntry?: boolean;
    editEntry?: boolean;
    separator?: string;
    required?: boolean;
    requiredText?: string;
    parse?: (x: string) => any;
    constraint?: (x: any) => boolean;
}

export interface IDbEditorSettings {
    el: JQuery | HTMLElement;
    columns: IColumn[];
    endpoint: string;
    templateApi?: string;
    readOnly?: boolean;
    newEntry?: boolean;
    theme?: string;
}

export interface IJqList {
    [key: string]: JQuery;
}

export interface IQuillList {
    [key: string]: Quill;
}

export interface IModalList {
    [key: string]: tingle.modal;
}

export class DbEditor {
    private settings: IDbEditorSettings;
    private page = {
        current: 0,
        count: 0,
        from: 0,
        to: 0,
        total: 0
    };

    private $el: IJqList = {};
    private quill: IQuillList = {};
    private modal: IModalList = {};
    private current = {
        vocab: ""
    };

    constructor(settings: IDbEditorSettings) {
        this.settings = settings;
        this.$el.main = $(settings.el);
        this.$el.main.removeClass("container").removeClass("container-fluid");

        if ($("nav").length === 0) {
            this.$el.main.prepend(`
            <nav class="navbar navbar-expand-lg navbar-light bg-light">
                <button class="navbar-toggler" type="button" data-toggle="collapse" data-target=".db-editor-nav"
                    aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse db-editor-nav">
                    <ul class="navbar-nav mr-auto"></ul>
                </div>
            </nav>`);
        }

        if ($(".db-editor-nav").length === 0) {
            $("nav .navbar-nav").first().append(`
            <li class="nav-item db-editor-nav">
                <div class="page-control">
                    <button class="btn d-inline mr-1 db-editor-prev-all" disabled="disabled">
                        &#x3C;&#x3C;
                    </button>
                    <button class="btn d-inline mr-1 db-editor-prev" disabled="disabled">
                        &#x3C;
                    </button>
                    <span class="d-inline mr-3 db-editor-number-current">
                        0-0
                    </span>
                    <span class="d-inline mr-3">
                        of
                    </span>
                    <span class="d-inline mr-1 db-editor-number-total">
                        0
                    </span>
                    <button class="btn d-inline mr-1 db-editor-next" disabled="disabled">
                        &#x3E;
                    </button>
                    <button class="btn d-inline db-editor-next-all" disabled="disabled">
                        &#x3E;&#x3E;
                    </button>
                </div>
            </li>
            <li class="nav-item db-editor-nav db-editor-new-entry-button-nav">
                <button class="btn btn-primary ml-3 mr-3 db-editor-new-entry-button form-control" type="button">
                    Add new entry
                </button>
            </li>`);

            $(".search-bar-area").append(`
            <input class="form-control mr-sm-2 db-editor-nav db-editor-search-bar w-300"
            autocomplete="false" placeholder="Type here to search" />`);
        }

        this.$el.main.addClass("db-editor");
        this.$el.main.html(`
        <div class="db-editor-table">
            <table class="table table-striped">
                <thead>
                    <tr></tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>`);

        this.$el.tbody = $("tbody", settings.el);
        this.$el.newEntryButton = $(".db-editor-new-entry-button");
        this.$el.searchBar = $(".db-editor-search-bar");
        this.$el.prev = $(".db-editor-prev");
        this.$el.prevAll = $(".db-editor-prev-all");
        this.$el.next = $(".db-editor-next");
        this.$el.nextAll = $(".db-editor-next-all");
        this.$el.numberCurrent = $(".db-editor-number-current");
        this.$el.numberTotal = $(".db-editor-number-total");

        if (typeof settings.newEntry === "boolean" && !settings.newEntry) {
            $(".db-editor-new-entry-button-nav", settings.el).hide();
        } else {
            this.$el.newEntry = $(`
            <form class="needs-validation db-editor-new-entry-editor">
                <h3>Add new entry</h3>
            </form>`);

            for (const col of this.settings.columns) {
                if (typeof col.newEntry === "boolean" && !col.newEntry) {
                    continue;
                }

                switch (col.type) {
                    case "one-line":
                    case "number":
                    case "list":
                    case "datetime":
                        this.$el[col.name] = $(`
                        <div class="form-group row">
                            <label class="col-sm-2 col-form-label">${col.label || toTitle(col.name)}</label>
                            <div class="col-sm-10">
                                <input class="form-control" type="text"
                                name="${col.name}" ${col.required ? "required" : ""}>
                            </div>
                        </div>`);
                        break;
                    case "html":
                    default:
                        this.$el[col.name] = $(`
                        <div class="form-group">
                            <label>${toTitle(col.name)}</label>
                            <div class="db-editor-quill"></div>
                            <textarea class="form-control db-editor-quill-textarea h-0" tabindex="-1"
                            name="${col.name}" ${col.required ? "required" : ""}></textarea>
                        </div>"`);
                }

                $("input, textarea", this.$el[col.name]).val("");

                if (settings.templateApi && col.name === "template") {
                    $("input, textarea", this.$el[col.name]).on("input", (e) => {
                        const v = (e.target as any).value;
                        if (v) {
                            fetchJSON(this.settings.templateApi!, {template: v}).then((t) => {
                                if (t) {
                                    for (const col2 of settings.columns) {
                                        if (t[col2.name]) {
                                            if (col2.type === "html") {
                                                this.quill[col2.name].setText("");
                                                this.quill[col2.name].clipboard.dangerouslyPasteHTML(0, t[col2.name]);
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    });
                }

                this.$el.newEntry.append(this.$el[col.name]);
                this.$el[col.name].data("col", col);

                if (col.required) {
                    $("input, textarea", this.$el[col.name]).parent().append(`
                    <div class="invalid-feedback">
                        ${col.requiredText ? col.requiredText : `${toTitle(col.name)} is required.`}
                    </div>`);
                }
            }

            this.modal.newEntry = new tingle.modal({
                footer: true,
                stickyFooter: false,
                closeMethods: ["button", "escape"],
                onOpen: () => {
                    this.$el.newEntry.removeClass("was-validated");

                    for (const col of settings.columns) {
                        if (col.type === "html") {
                            this.quill[col.name].setText("");
                        }
                    }
                },
                onClose: () => {
                    (this.$el.newEntry.get(0) as HTMLFormElement).reset();
                    Object.values(this.quill).forEach((el) => el.setText(""));
                }
            });

            this.$el.main.append(this.$el.newEntry);
            this.modal.newEntry.setContent(this.$el.newEntry.get(0));
            this.modal.newEntry.addFooterBtn("Save", "tingle-btn tingle-btn--primary", () => {
                for (const col of this.settings.columns) {
                    if (col.type === "html") {
                        const qRoot = this.quill[col.name].root;
                        const val = qRoot.innerText.trim() ? qRoot.innerHTML : "";
                        $("input, textarea", this.$el[col.name]).val(val);
                    }
                }

                for (const col of this.settings.columns) {
                    if (col.required) {
                        col.constraint = col.constraint ? col.constraint : (x: any) => !!x;
                        if (!col.constraint!($("input, textarea", this.$el[col.name]).val())) {
                            this.$el.newEntry.addClass("was-validated");
                            return;
                        }
                    }
                }

                const entry = {} as any;
                for (const col of this.settings.columns) {
                    let v: string | number | string[] | object | null =
                    ($("input, textarea", this.$el[col.name]).val() || "") as string;
                    if (col.type === "list") {
                        const ls = v.split(col.separator || " ");
                        v = ls.filter((el, i) => el && ls.indexOf(el) === i).sort();
                    } else if (col.type === "number") {
                        v = v ? parseFloat(v) : null;
                    }

                    entry[col.name] = v;
                }

                this.addEntry(entry, true);
                this.modal.newEntry.close();
            });
        }

        if (!settings.readOnly) {
            this.$el.mainEditor = $(`
            <div class="db-editor-main-editor">
                <textarea class="hidden"></textarea>
                <div class="db-editor-quill"></div>
            </div>`);
            this.$el.main.append(this.$el.mainEditor);

            this.$el.listEditor = $(`
            <form class="db-editor-list-editor">
                <h3></h3>
                <div class="db-editor-list row">
                </div>
                <button type="button" class="btn btn-success db-editor-add-list-entry">Add</button>
            </form>`);
            this.$el.main.append(this.$el.listEditor);

            this.quill.mainEditor = new Quill($(".db-editor-quill", this.$el.mainEditor).get(0), {
                theme: settings.theme || "snow"
            });

            for (const col of this.settings.columns) {
                if (col.type === "html") {
                    if (typeof col.newEntry === "boolean" && !col.newEntry) {
                        continue;
                    }

                    this.quill[col.name] = new Quill($(".db-editor-quill", this.$el[col.name]).get(0), {
                        theme: settings.theme || "snow"
                    });
                }
            }

            this.modal.mainEditor = new tingle.modal({
                footer: true,
                stickyFooter: false,
                closeMethods: ["button", "escape"],
                onClose: () => this.quill.mainEditor.setText("")
            });
            this.modal.mainEditor.setContent(this.$el.mainEditor.get(0));
            this.modal.mainEditor.addFooterBtn("Save", "tingle-btn tingle-btn--primary", () => {
                const qRoot = this.quill.mainEditor.root;
                const val = qRoot.innerText.trim() ? qRoot.innerHTML : "";
                const $target = this.$el.mainEditor.data("$target");
                const $cellWrapper = $target.find(".cell-wrapper");

                this.updateServer($target, val)
                .then(() => $cellWrapper.html(val));

                this.modal.mainEditor.close();
            });

            this.modal.listEditor = new tingle.modal({
                footer: true,
                stickyFooter: false,
                closeMethods: ["button", "escape"],
                onClose: () => $(".db-editor-list-entry").remove()
            });
            this.modal.listEditor.setContent(this.$el.listEditor.get(0));
            this.modal.listEditor.addFooterBtn("Save", "tingle-btn tingle-btn--primary", () => {
                const ls = $(".db-editor-list-entry input").toArray().map((el) => $(el).val()).filter((el) => el).sort();
                const $target = this.$el.mainEditor.data("$target");
                const $cellWrapper = $target.find(".cell-wrapper");

                this.updateServer($target, ls)
                .then(() => $cellWrapper.text(ls.join("\n")));

                this.modal.listEditor.close();
            });
        }

        this.$el.prevAll.on("click", () => {
            this.page.current = 1;
            this.fetchData();
        });

        this.$el.prev.on("click", () => {
            this.page.current--;
            this.fetchData();
        });

        this.$el.next.on("click", () => {
            this.page.current++;
            this.fetchData();
        });

        this.$el.nextAll.on("click", () => {
            this.page.current = this.page.count;
            this.fetchData();
        });

        this.$el.newEntryButton.on("click", () => {
            this.modal.newEntry.open();
        });

        if (!settings.readOnly) {
            this.$el.tbody
            .on("click", "td", (e) => {
                const $target = $(e.target).closest("td");
                const col: IColumn = $target.data("col");
                if (!col) {
                    return;
                }

                const fieldName: string = $target.data("name");
                const fieldData = $target.data("data");

                if (col.type === "datetime") {
                    $target.find("input").get(0)._flatpickr.open();
                    return;
                }

                if (col.type === "list") {
                    if (fieldData) {
                        fieldData.forEach((el: string) => this.addListEntry(el));
                    }
                    this.addListEntry();

                    $(".db-entry-list-entry input", settings.el).each((i, el) => this.checkListInput(el as HTMLInputElement));
                    this.$el.listEditor.data("$target", $target);

                    this.modal.listEditor.open();
                    return;
                }

                if (col.type === "html") {
                    this.quill.mainEditor.setText("");
                    this.quill.mainEditor.clipboard.dangerouslyPasteHTML(0, fieldData);
                    this.$el.mainEditor.data("$target", $target);
                    this.modal.mainEditor.open();
                    return;
                }

                const data = {
                    offset: $target.offset(),
                    height: e.target.clientHeight,
                    width: e.target.clientWidth,
                    fieldName,
                    fieldData
                };

                const $input = $("<textarea class='db-editor-cell-editor'>");
                $input.css("position", "absolute");
                this.$el.main.append($input);
                $input.offset(data.offset!);
                $input.height(data.height!);
                $input.width(data.width!);
                $input.css("max-height", `${data.height}px !important`);
                $input.val(data.fieldData);
                $input.focus();

                $input.data("fieldName", fieldName);
                $input.data("$target", $target);

                setTimeout(() => $input.addClass("db-editor-cell-editor-can-remove"), 10);
            })
            .on("click", ".db-editor-row-delete", (e) => {
                if (confirm("Are you sure you want to delete this entry?")) {
                    const $tr = $(e.target).parent("tr");
                    fetchJSON(settings.endpoint, {id: $tr.data("id")}, "DELETE");
                    $tr.remove();
                }
            });

            $(document.body).on("click", () => {
                $(".db-editor-cell-editor-can-remove:not(:hover)", this.$el.main).each((i, el) => {
                    this.submitTextAreaAndRemove(el);
                });
            });

            this.$el.main.on("keydown", ".db-editor-cell-editor", (e) => {
                const $target = $(e.target);
                if (e.keyCode === 13 || e.which === 13 || e.key === "Enter") {
                    if (e.shiftKey || e.metaKey) {
                        $target.trigger($.Event("keydown"), {
                            keyCode: 13,
                            shiftKey: false,
                            metaKey: false
                        });
                    } else {
                        this.submitTextAreaAndRemove(e.target);
                    }
                }
            });

            this.$el.listEditor
            .on("keydown", "input", (e) => {
                this.checkListInput(e.target);
            })
            .on("click", ".db-editor-list-entry button", (e) => {
                $(e.target).closest(".db-editor-list-entry").remove();
            });

            $(".db-editor-add-list-entry", settings.el).on("click", () => {
                this.addListEntry();
            });
        }

        this.$el.searchBar.on("keyup", () => this.fetchData());

        $("table", settings.el).width(settings.columns.map((col) => col.width).reduce((acc, x) => acc + x));

        const $thtr = $("thead tr", settings.el);
        let $th: JQuery;
        for (const col of settings.columns) {
            $th = $(`<th scope="col">${col.name}</th>`);
            $thtr.append($th);
            $th.width(col.width);
        }

        $th = $(`<th scope="col"></th>`);
        $thtr.append($th);

        this.fetchData();
    }

    private async addEntry(entry: any, isNew = false) {
        let id: string = entry.id;
        if (isNew) {
            try {
                const r = (await fetchJSON(this.settings.endpoint, {create: entry}, "PUT"));
                if (!r) {
                    return;
                }
                id = r.id;
            } catch (e) {
                alert("Not created.");
                return;
            }
            this.page.count++;
            this.page.to++;
            this.page.total++;
            this.setPageNav();
        }

        const $tr = $("<tr>");

        for (const col of this.settings.columns) {
            const data = entry[col.name] || "";
            const $seg = $("<td>");

            if (col.type === "datetime") {
                const $input = $(`<input class="clear" value="${data || ""}">`);
                $seg.append($input);

                flatpickr($input, {
                    enableTime: true,
                    defaultDate: data,
                    dateFormat: "Y-M-d H:i",
                    onClose: (dates) => {
                        this.updateServer($seg, dates[0].toISOString())
                        .then(() => $seg.data("data", dates[0].toISOString()));
                    }
                });
            } else {
                const $cellWrapper = $(`<div class="cell-wrapper">`);
                $seg.append($cellWrapper);

                if (col.type === "html") {
                    $cellWrapper.html(data);
                } else {
                    $cellWrapper.text(data);
                }
            }

            $seg.data("name", col.name);
            $seg.data("data", data);
            $seg.data("col", col);
            $tr.append($seg);
        }

        $tr.append(`
        <td style="vertical-align: middle;" class="db-editor-row-delete pointer">
            ✘
        </td>`);
        $tr.data("id", id);

        if (isNew) {
            $("tbody", this.settings.el).prepend($tr);
        } else {
            this.$el.tbody.append($tr);
        }
    }

    private async updateServer($target: JQuery, val: any): Promise<JQuery | null> {
        try {
            await fetchJSON(this.settings.endpoint, {
                id: $target.closest("tr").data("id"),
                fieldName: $target.data("name"),
                fieldData: val
            }, "PUT");
        } catch (e) {
            // alert("Not updated.");
            return null;
        }

        $target.data("data", val);

        return $target;
    }

    private async fetchData(limit: number = 10) {
        this.page.from = (this.page.current - 1) * limit + 1;
        if (this.page.from <= 0) {
            this.page.from = 1;
        }

        const r = await fetchJSON(this.settings.endpoint, {
            q: this.$el.searchBar.val(),
            offset: this.page.from - 1,
            limit
        });

        this.$el.tbody.html("");
        r.data.forEach((el: any) => this.addEntry(el));
        if (!r.total) {
            this.page.current = 0;
            this.page.count = 0;
            this.page.from = 0;
            this.page.to = 0;
            this.page.total = 0;
        } else {
            const total = r.total;

            if (this.page.from <= 0) {
                this.page.from = 1;
            }

            this.page.to = this.page.from - 1 + limit;
            if (this.page.to > total) {
                this.page.to = total;
            }

            this.page.total = total;
            this.page.count = Math.ceil(this.page.total / limit);
            if (this.page.current > this.page.count) {
                this.page.current = 0;
            } else if (this.page.current <= 0) {
                this.page.current = Math.floor((this.page.from - 1) / limit + 1);
            }
        }

        this.setPageNav();
    }

    private setPageNav() {
        this.$el.numberCurrent.text(`${this.page.from}-${this.page.to}`);
        this.$el.numberTotal.text(this.page.total.toString());

        this.$el.prevAll.prop("disabled", !(this.page.from > 1));
        this.$el.prev.prop("disabled", !(this.page.from > 1));

        this.$el.next.prop("disabled", !(this.page.to < this.page.total));
        this.$el.nextAll.prop("disabled", !(this.page.to < this.page.total));
    }

    private addListEntry(s?: string) {
        const $listEntry = $(`
        <div class="input-group mb-2 db-editor-list-entry col-12">
            <div class="input-group-prepend">
                <button class="input-group-text btn btn-outline-danger" type="button" disabled>&#x2715;</button>
            </div>
            <input class="form-control">
        </div>`);
        $(".db-editor-list", this.$el.listEditor).append($listEntry);
        $("input", $listEntry).val(s || "");
    }

    private checkListInput(el: any) {
        const $el = $(el);
        const $button = $el.closest(".db-editor-list-entry").find("button");
        $button.prop("disabled", !$el.val());
    }

    private async submitTextAreaAndRemove(el: any) {
        const $el = $(el);
        const $target = $el.data("$target");
        const $cellWrapper = $target.find(".cell-wrapper");
        const col: IColumn = $target.data("col");
        let val = $el.val() as string;

        const vocab = $target.closest("tr").data("vocab");
        if (this.settings.templateApi) {
            const t = await fetchJSON(this.settings.templateApi);
            if (t) {
                val = t[col.name] || "";
            }
        }

        if (col.type === "number") {
            col.parse = col.parse ? col.parse : (x) => {
                const n = parseFloat(x);
                return isNaN(n) ? null : n;
            };
        }

        if (col.constraint && !col.constraint(val)) {
        } else if (col.parse) {
            const no = col.parse(val);
            this.updateServer($target, no)
            .then(() => $cellWrapper.text(no !== null ? no : ""));
        } else if (col.type === "html") {
            this.updateServer($el.data("$target"), val)
            .then(() => $cellWrapper.html(val));
        } else {
            this.updateServer($el.data("$target"), val)
            .then(() => $cellWrapper.text(val));
        }

        $el.remove();
    }
}

export default DbEditor;
