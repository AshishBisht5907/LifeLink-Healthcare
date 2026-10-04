from django.contrib import admin
from apps.consents.models import ConsentRequest, ConsentAction

admin.site.register(ConsentRequest)
admin.site.register(ConsentAction)
