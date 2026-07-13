#include <functional>
#include <memory>
#include <cstring>
#include <nan.h>
#include <v8.h>

#include "async_callback.h"
#include "functional_callback.h"

using Nan::FunctionCallback;
using Nan::FunctionCallbackInfo;
using std::unique_ptr;
using v8::ArrayBuffer;
using v8::Function;
using v8::Isolate;
using v8::Local;
using v8::Value;

void _noop_callback_helper(const FunctionCallbackInfo<Value> & /*info*/)
{
  // Do nothing
}

void _fn_callback_helper(const FunctionCallbackInfo<Value> &info)
{
  Local<ArrayBuffer> cb_array = info.Data().As<ArrayBuffer>();
  // Electron 14+ / modern V8: ArrayBuffer::GetContents removed
  std::shared_ptr<v8::BackingStore> store = cb_array->GetBackingStore();

  assert(store->ByteLength() == sizeof(intptr_t));
  auto *stored = static_cast<intptr_t *>(store->Data());
  auto *fn = reinterpret_cast<FnCallback *>(*stored);
  (*fn)(info);
}

unique_ptr<AsyncCallback> fn_callback(const char *async_name, FnCallback &fn)
{
  Nan::HandleScope scope;

  // Store the function pointer address as an intptr_t inside an ArrayBuffer.
  // Electron 14+ / modern V8: no ArrayBuffer::New(isolate, data, length) and no GetContents.
  Isolate *isolate = Isolate::GetCurrent();
  intptr_t fn_addr_value = reinterpret_cast<intptr_t>(&fn);
  Local<ArrayBuffer> fn_addr = ArrayBuffer::New(isolate, sizeof(intptr_t));
  std::memcpy(fn_addr->GetBackingStore()->Data(), &fn_addr_value, sizeof(intptr_t));

  Local<Function> wrapper = Nan::New<Function>(_fn_callback_helper, fn_addr);
  return unique_ptr<AsyncCallback>(new AsyncCallback(async_name, wrapper));
}

unique_ptr<AsyncCallback> noop_callback()
{
  Nan::HandleScope scope;

  Local<Function> wrapper = Nan::New<Function>(_noop_callback_helper);
  return unique_ptr<AsyncCallback>(new AsyncCallback("@atom/watcher:noop", wrapper));
}
