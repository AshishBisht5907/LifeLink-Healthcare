import logging

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger('lifelink.errors')


def lifelink_exception_handler(exc, context):
    """Wraps DRF's default handler so:
    - Users never see raw stack traces (section 42).
    - Unhandled exceptions become a clean 500 with a generic message.
    - Everything is still logged server-side with context for debugging.
    """
    response = exception_handler(exc, context)

    if response is not None:
        # Normalize DRF's default error shape into a consistent envelope.
        detail = response.data
        response.data = {
            'error': True,
            'code': response.status_code,
            'message': _extract_message(detail),
            'detail': detail,
        }
        return response

    # Unhandled exception -> generic 500, full detail only in server logs.
    view = context.get('view')
    logger.exception('unhandled_exception view=%s', view.__class__.__name__ if view else 'unknown')
    return Response(
        {
            'error': True,
            'code': status.HTTP_500_INTERNAL_SERVER_ERROR,
            'message': 'Something went wrong. Please try again or contact support.',
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _first_text(value):
    """Dig out the first human-readable string from any DRF error shape."""
    if isinstance(value, dict):
        for v in value.values():
            found = _first_text(v)
            if found:
                return found
        return ''
    if isinstance(value, (list, tuple)):
        for v in value:
            found = _first_text(v)
            if found:
                return found
        return ''
    return str(value)


def _extract_message(detail):
    return _first_text(detail) or 'The request could not be completed.'
