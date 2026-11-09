// Copyright (C) 2013 Christian Stehno
// This file is part of the "Irrlicht Engine".
// For conditions of distribution and use, see copyright notice in Irrlicht.h

#include "CSDL2ContextManager.h"
#ifdef __EMSCRIPTEN__
#include <emscripten/html5.h>
#include <emscripten.h>
#include <stdio.h>
#endif

#ifdef _IRR_COMPILE_WITH_SDL2_DEVICE_

#include <SDL2/SDL.h>
#include "os.h"

namespace irr
{
namespace video
{

CSDL2ContextManager::CSDL2ContextManager(const SExposedVideoData& videodata) : Params(), PrimaryContext(videodata), CurrentContext(), GLLibraryLoaded(false)
{
	#ifdef _DEBUG
	setDebugName("CSDL2ContextManager");
	#endif
	GLLibraryLoaded = SDL_GL_LoadLibrary(nullptr) == 0;
	CurrentContext.OGLSDL2.Window = GetWindow(PrimaryContext);
	CurrentContext.OGLSDL2.Context = nullptr;
	CurrentContext.OGLSDL2.HWnd = PrimaryContext.OGLSDL2.HWnd;
}

CSDL2ContextManager::~CSDL2ContextManager()
{
	if(GetContext(PrimaryContext) != nullptr)
		SDL_GL_DeleteContext(GetContext(PrimaryContext));
	if(GLLibraryLoaded)
		SDL_GL_UnloadLibrary();
}

static void logAttributes() {
	core::stringc sdl_attr("SDL attribs:");
	int value = 0;
	if(SDL_GL_GetAttribute(SDL_GL_RED_SIZE, &value) == 0)
		sdl_attr += core::stringc(" r:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_GREEN_SIZE, &value) == 0)
		sdl_attr += core::stringc(" g:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_BLUE_SIZE, &value) == 0)
		sdl_attr += core::stringc(" b:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_ALPHA_SIZE, &value) == 0)
		sdl_attr += core::stringc(" a:") + core::stringc(value);

	if(SDL_GL_GetAttribute(SDL_GL_DEPTH_SIZE, &value) == 0)
		sdl_attr += core::stringc(" depth:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_STENCIL_SIZE, &value) == 0)
		sdl_attr += core::stringc(" stencil:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_DOUBLEBUFFER, &value) == 0)
		sdl_attr += core::stringc(" doublebuf:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_MULTISAMPLEBUFFERS, &value) == 0)
		sdl_attr += core::stringc(" aa:") + core::stringc(value);
	if(SDL_GL_GetAttribute(SDL_GL_MULTISAMPLESAMPLES, &value) == 0)
		sdl_attr += core::stringc(" aa-samples:") + core::stringc(value);

	os::Printer::log(sdl_attr.c_str());
}

void CSDL2ContextManager::SetWindowOGLProperties(const SIrrlichtCreationParameters& CreationParams) {
	if(CreationParams.Bits == 16) {
		SDL_GL_SetAttribute(SDL_GL_RED_SIZE, 4);
		SDL_GL_SetAttribute(SDL_GL_GREEN_SIZE, 4);
		SDL_GL_SetAttribute(SDL_GL_BLUE_SIZE, 4);
		SDL_GL_SetAttribute(SDL_GL_ALPHA_SIZE, CreationParams.WithAlphaChannel ? 1 : 0);
	} else {
		SDL_GL_SetAttribute(SDL_GL_RED_SIZE, 8);
		SDL_GL_SetAttribute(SDL_GL_GREEN_SIZE, 8);
		SDL_GL_SetAttribute(SDL_GL_BLUE_SIZE, 8);
		SDL_GL_SetAttribute(SDL_GL_ALPHA_SIZE, CreationParams.WithAlphaChannel ? 8 : 0);
	}
	SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, CreationParams.ZBufferBits);
	if(CreationParams.Doublebuffer)
		SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
	if(CreationParams.Stereobuffer)
		SDL_GL_SetAttribute(SDL_GL_STEREO, 1);
	if(CreationParams.AntiAlias > 1) {
		SDL_GL_SetAttribute(SDL_GL_MULTISAMPLEBUFFERS, 1);
		SDL_GL_SetAttribute(SDL_GL_MULTISAMPLESAMPLES, CreationParams.AntiAlias);
	} else {
		SDL_GL_SetAttribute(SDL_GL_MULTISAMPLEBUFFERS, 0);
		SDL_GL_SetAttribute(SDL_GL_MULTISAMPLESAMPLES, 0);
	}
	switch(CreationParams.DriverType) {
	case irr::video::E_DRIVER_TYPE::EDT_OGLES1:
	{
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 1);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
		break;
	}
	case irr::video::E_DRIVER_TYPE::EDT_WEBGL1:
		logAttributes();
		//
	case irr::video::E_DRIVER_TYPE::EDT_OGLES2:
	{
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
		SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
		break;
	}
	default:
		break;
	}
}

bool CSDL2ContextManager::initialize(const SIrrlichtCreationParameters& params, const SExposedVideoData& videodata)
{
	if(!GLLibraryLoaded)
		return false;
	Params = params;

	CurrentContext.OGLSDL2.Window = GetWindow(videodata);

	return true;
}

void CSDL2ContextManager::terminate()
{
	if(GetWindow(PrimaryContext) != nullptr && GetWindow(CurrentContext) == GetWindow(PrimaryContext))
		memset(&PrimaryContext, 0, sizeof(PrimaryContext));
	memset(&CurrentContext, 0, sizeof(CurrentContext));
}

bool CSDL2ContextManager::generateSurface()
{
	return true;
}

void CSDL2ContextManager::destroySurface()
{
}

bool CSDL2ContextManager::generateContext()
{
#ifdef __EMSCRIPTEN__
	/* [web] 브라우저는 캔버스당 WebGL 컨텍스트가 1개뿐이다.
	   EDOPro 는 데이터 로딩용 임시 디바이스를 따로 만들기 때문에,
	   컨텍스트를 공유하지 않으면 뒤에 만든 쪽이 앞의 컨텍스트를 잃는다. */
	static SDL_GLContext sharedContext = nullptr;
	if(sharedContext != nullptr) {
		CurrentContext.OGLSDL2.Context = sharedContext;
		if(PrimaryContext.OGLSDL2.Context == nullptr)
			PrimaryContext.OGLSDL2.Context = sharedContext;
		SDL_GL_MakeCurrent(GetWindow(CurrentContext), sharedContext);
		fprintf(stderr, "[ctx] reuse shared ctx=%p cur=%d\n", (void*)sharedContext, (int)emscripten_webgl_get_current_context());
		return true;
	}
#endif
	auto Context = SDL_GL_CreateContext(GetWindow(CurrentContext));
#ifdef __EMSCRIPTEN__
	sharedContext = Context;
#endif
#ifdef __EMSCRIPTEN__
	fprintf(stderr, "[ctx] generate win=%p ctx=%p err=%s cur=%d\n", (void*)GetWindow(CurrentContext), (void*)Context, SDL_GetError(), (int)emscripten_webgl_get_current_context());
#endif
	CurrentContext.OGLSDL2.Context = Context;
	if(PrimaryContext.OGLSDL2.Context == nullptr)
		PrimaryContext.OGLSDL2.Context = Context;
	/* emscripten: SDL_GL_CreateContext 만으로는 GLctx 가 설정되지 않는 경우가 있어 명시적으로 current 로 만든다 */
	if(Context != nullptr) {
		SDL_GL_MakeCurrent(GetWindow(CurrentContext), Context);
#ifdef __EMSCRIPTEN__
		fprintf(stderr, "[ctx] after MakeCurrent cur=%d err=%s\n", (int)emscripten_webgl_get_current_context(), SDL_GetError());
#endif
	}
	return Context != nullptr;
}

const SExposedVideoData& CSDL2ContextManager::getContext() const
{
	return CurrentContext;
}

bool CSDL2ContextManager::activateContext(const SExposedVideoData& videoData, bool restorePrimaryOnZero)
{
	if(GetWindow(videoData) != nullptr && GetContext(videoData) != nullptr) {
		if(SDL_GL_MakeCurrent(GetWindow(videoData), GetContext(videoData)) != 0) {
			os::Printer::log("Render Context switch failed.");
			return false;
		}
	}
	// set back to main context
	else if(GetWindow(videoData) == nullptr && GetContext(CurrentContext) != GetContext(PrimaryContext)) {
		if(SDL_GL_MakeCurrent(GetWindow(PrimaryContext), GetContext(PrimaryContext)) != 0) {
			os::Printer::log("Render Context switch failed.");
			return false;
		}
		CurrentContext = PrimaryContext;
	}
	return true;
}

void CSDL2ContextManager::destroyContext()
{
#ifdef __EMSCRIPTEN__
	/* [web] 컨텍스트는 페이지 수명과 함께 간다. 여기서 지우면 이후 GL 호출이 모두 죽는다. */
	fprintf(stderr, "[ctx] destroyContext requested (ignored on emscripten)\n");
	return;
#endif
	if(GetContext(CurrentContext) != nullptr) {
		if(SDL_GL_MakeCurrent(GetWindow(CurrentContext), nullptr) != 0)
			os::Printer::log("Release of render context failed.", ELL_WARNING);

		SDL_GL_DeleteContext(GetContext(CurrentContext));
#ifdef __EMSCRIPTEN__
		{
			char stackbuf[2048];
			emscripten_get_callstack(EM_LOG_C_STACK, stackbuf, sizeof(stackbuf));
			fprintf(stderr, "[ctx] destroyed cur=%d\n%s\n", (int)emscripten_webgl_get_current_context(), stackbuf);
		}
#endif

		if(GetContext(CurrentContext) == GetContext(PrimaryContext))
			PrimaryContext.OGLSDL2.Context = nullptr;
		CurrentContext.OGLSDL2.Context = nullptr;
	}
}

bool CSDL2ContextManager::swapBuffers()
{
	SDL_GL_SwapWindow(GetWindow(CurrentContext));
	return true;
}

void CSDL2ContextManager::swapInterval(int interval)
{
	SDL_GL_SetSwapInterval(interval);
}

void* CSDL2ContextManager::loadFunction(const char* function_name)
{
	return SDL_GL_GetProcAddress(function_name);
}

}
}

#endif
