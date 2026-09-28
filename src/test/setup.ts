import "@testing-library/jest-dom/vitest";


// jsdom has no modal <dialog>. Enough of it for the UI: open/close and the close event.
// (Focus trapping and background inertness are the browser's job and are not simulated.)
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.dataset.modal = "true";
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
