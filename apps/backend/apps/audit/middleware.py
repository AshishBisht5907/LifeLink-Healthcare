import threading

_thread_locals = threading.local()


class RequestContextMiddleware:
    """Stashes the current request in a thread-local so that audit logging
    calls deep inside services (which don't have direct access to the
    request object) can still capture IP/user-agent/actor."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.request = request
        try:
            response = self.get_response(request)
        finally:
            _thread_locals.request = None
        return response


def get_current_request():
    return getattr(_thread_locals, 'request', None)


def get_client_ip(request):
    if request is None:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
