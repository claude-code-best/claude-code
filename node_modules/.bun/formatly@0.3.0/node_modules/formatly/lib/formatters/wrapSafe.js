function wrapSafe(task) {
  try {
    return task();
  } catch {
    return void 0;
  }
}
export {
  wrapSafe
};
