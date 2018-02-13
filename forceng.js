/**
 * ForceNG - REST toolkit for Salesforce.com
 * Author: Christophe Coenraets @ccoenraets
 * Edited: Krzysztof Pintscher k.pintscher@polsource.com @niou-ns
 * Version: 0.8
 */
angular.module('forceng', [])

  .factory('force', function ($rootScope, $q, $window, $http, $httpParamSerializer, $timeout) {

    // The login URL for the OAuth process
    // To override default, pass loginURL in init(props)
    var loginURL = 'https://login.salesforce.com',

    // The Connected App client Id. Default app id provided - Not for production use.
    // This application supports http://localhost:8200/oauthcallback.html as a valid callback URL
    // To override default, pass appId in init(props)
      appId = '3MVG9fMtCkV6eLheIEZplMqWfnGlf3Y.BcWdOf1qytXo9zxgbsrUbS.ExHTgUPJeb3jZeT8NYhc.hMyznKU92',

    // The force.com API version to use.
    // To override default, pass apiVersion in init(props)
      apiVersion = 'v39.0',

    // Keep track of OAuth data (access_token, refresh_token, instance_url, user_id and org_id)
      oauth,

    // By default we store token in sessionStorage. This can be overridden in init()
      tokenStore = $window.sessionStorage,

    // if page URL is http://localhost:3000/myapp/index.html, context is /myapp
      context = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/")),

    // if page URL is http://localhost:3000/myapp/index.html, serverURL is http://localhost:3000
      serverURL = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : ''),

    // if page URL is http://localhost:3000/myapp/index.html, baseURL is http://localhost:3000/myapp
      baseURL = serverURL + context,

    // Only required when using REST APIs in an app hosted on your own server to avoid cross domain policy issues
    // To override default, pass proxyURL in init(props)
      proxyURL = baseURL,

    // if page URL is http://localhost:3000/myapp/index.html, oauthCallbackURL is http://localhost:3000/myapp/oauthcallback.html
    // To override default, pass oauthCallbackURL in init(props)
      oauthCallbackURL = baseURL + '/oauthcallback.html',

    // Because the OAuth login spans multiple processes, we need to keep the login success and error handlers as a variables
    // inside the module instead of keeping them local within the login function.
      deferredLogin,

    // Reference to the Salesforce OAuth plugin
      oauthPlugin,

    // Reference to the Salesforce Network plugin
      networkPlugin,

    // Where or not to use cordova for oauth and network calls
      useCordova = window.cordova ? true : false,

    // Whether or not to use a CORS proxy. Defaults to false if app running in Cordova or in a VF page
    // Can be overriden in init()
      useProxy = (window.cordova || window.SfdcApp || window.sforce) ? false : true,

      retry = false;

    /*
     * Determines the request base URL.
     */
    function getRequestBaseURL() {

      var url;

      if (useProxy) {
        url = proxyURL;
      } else if (oauth.instance_url) {
        url = oauth.instance_url;
      } else {
        url = serverURL;
      }

      // dev friendly API: Remove trailing '/' if any so url + path concat always works
      if (url.slice(-1) === '/') {
        url = url.slice(0, -1);
      }

      return url;
    }

    function parseQueryString(queryString) {
      var qs = decodeURIComponent(queryString),
        obj = {},
        params = qs.split('&');
      params.forEach(function (param) {
        var splitter = param.split('=');
        obj[splitter[0]] = splitter[1];
      });
      return obj;
    }

    function toQueryString(obj) {
      var parts = [],
        i;
      for (i in obj) {
        if (obj.hasOwnProperty(i)) {
          parts.push(encodeURIComponent(i) + "=" + encodeURIComponent(obj[i]));
        }
      }
      return parts.join("&");
    }

    function refreshTokenWithPlugin() {
      var deferred = $q.defer();
      oauthPlugin.authenticate(
        function (response) {
          oauth.access_token = response.accessToken;
          tokenStore.forceOAuth = JSON.stringify(oauth);
          deferred.resolve();
        },
        function () {
          console.log('Error refreshing oauth access token using the oauth plugin');
          deferred.reject();
        });
        return deferred.promise;
    }

    function refreshTokenWithHTTPRequest() {
      var deferred = $q.defer();
      var params = {
          'grant_type': 'refresh_token',
          'refresh_token': oauth.refresh_token,
          'client_id': appId
        },

        headers = {
          'Content-Type': 'application/json',
          'Target-URL': loginURL
        },

        url = useProxy ? proxyURL : loginURL;

      // dev friendly API: Remove trailing '/' if any so url + path concat always works
      if (url.slice(-1) === '/') {
        url = url.slice(0, -1);
      }

      url = url + '/services/oauth2/token?' + toQueryString(params);

      $http({
        headers: headers,
        method: 'POST',
        url: url,
        data: params
      })
        .success(function (data, status, headers, config) {
          console.log('Token refreshed');
          oauth.access_token = data.access_token;
          tokenStore.forceOAuth = JSON.stringify(oauth);
          deferred.resolve();
        })
        .error(function (data, status, headers, config) {
          console.log('Error while trying to refresh token');
          deferred.reject();
        });
        return deferred.promise;
    }

    function refreshToken() {
      if (useCordova) {
        if (!oauthPlugin) {
          console.error('Salesforce Mobile SDK OAuth plugin not available');
        } else {
          return refreshTokenWithPlugin();
        }
      } else {
        return refreshTokenWithHTTPRequest();
      }
    }

    /**
     * Initialize ForceNG
     * @param params
     *  appId (optional)
     *  loginURL (optional)
     *  proxyURL (optional)
     *  oauthCallbackURL (optional)
     *  apiVersion (optional)
     *  accessToken (optional)
     *  instanceURL (optional)
     *  refreshToken (optional)
     */
    function init(params) {

      if (params) {
        appId = params.appId || appId;
        apiVersion = params.apiVersion || apiVersion;
        loginURL = params.loginURL || loginURL;
        oauthCallbackURL = params.oauthCallbackURL || oauthCallbackURL;
        proxyURL = params.proxyURL || proxyURL;
        useProxy = params.useProxy === undefined ? useProxy : params.useProxy;
        useCordova = params.useCordova === undefined ? useCordova : params.useCordova;

        if (params.accessToken) {
          if (!oauth) oauth = {};
          oauth.access_token = params.accessToken;
        }

        if (params.instanceURL) {
          if (!oauth) oauth = {};
          oauth.instance_url = params.instanceURL;
        }

        if (params.refreshToken) {
          if (!oauth) oauth = {};
          oauth.refresh_token = params.refreshToken;
        }

        if (params.userId) {
          if (!oauth) oauth = {};
          oauth.user_id = params.userId;
        }

        if (params.orgId) {
          if (!oauth) oauth = {};
          oauth.org_id = params.orgId;
        }

        // Load previously saved token
        if (tokenStore['forceOAuth']) {
          oauth = JSON.parse(tokenStore['forceOAuth']);
        }

        if (useCordova) {
          document.addEventListener("deviceready", function () {
            try {
                networkPlugin = cordova.require("com.salesforce.plugin.network");
            } catch(e) {
                // fail silently
            }
            if (!networkPlugin) {
              console.log('Salesforce Mobile SDK Network plugin not available');
            }
          });
        }

      }

      console.log("useProxy: " + useProxy);
    }

    /**
     * Discard the OAuth access_token. Use this function to test the refresh token workflow.
     */
    function discardToken() {
      delete oauth.access_token;
      tokenStore.forceOAuth = JSON.stringify(oauth);
    }

    /**
     * Called internally either by oauthcallback.html (when the app is running the browser)
     * @param url - The oauthCallbackURL called by Salesforce at the end of the OAuth workflow. Includes the access_token in the querystring
     */
    function oauthCallback(url) {

      // Parse the OAuth data received from Salesforce
      var queryString,
        obj;

      if (url.indexOf("access_token=") > 0) {
        queryString = url.substr(url.indexOf('#') + 1);
        obj = parseQueryString(queryString);
        oauth = obj;
        // Paring out user id
        var oauthId = oauth.id.split('/');
        oauth.user_id = oauthId.pop();
        oauth.org_id  = oauthId.pop();
        tokenStore['forceOAuth'] = JSON.stringify(oauth);
        if (deferredLogin) deferredLogin.resolve();
      } else if (url.indexOf("error=") > 0) {
        queryString = decodeURIComponent(url.substring(url.indexOf('?') + 1));
        obj = parseQueryString(queryString);
        if (deferredLogin) deferredLogin.reject(obj);
      } else {
        if (deferredLogin) deferredLogin.reject({status: 'access_denied'});
      }
    }

    /**
     * Login to Salesforce using OAuth. If running in a Browser, the OAuth workflow happens in a a popup window.
     */
    function login() {
      deferredLogin = $q.defer();
      if (useCordova) {
        loginWithPlugin();
      } else {
        loginWithBrowser();
      }
      return deferredLogin.promise;
    }

    function logout() {
      if (useCordova) {
        oauthPlugin = cordova.require("com.salesforce.plugin.oauth");
        if (!oauthPlugin) {
          console.error('Salesforce Mobile SDK OAuth plugin not available');
        } else {
          oauthPlugin.logout();
        }
      } else {
        tokenStore.clear();
        $window.location.reload();
      }
    }

    function loginWithPlugin() {
      document.addEventListener("deviceready", function () {
        try {
            oauthPlugin = cordova.require("com.salesforce.plugin.oauth");
        } catch(e) {
            // fail silently
        }
        if (!oauthPlugin) {
          console.error('Salesforce Mobile SDK OAuth plugin not available');
          if (deferredLogin) deferredLogin.reject({status: 'Salesforce Mobile SDK OAuth plugin not available'});
          return;
        }
        oauthPlugin.getAuthCredentials(
          function (creds) {
            // Initialize ForceJS
            init({accessToken: creds.accessToken, instanceURL: creds.instanceUrl, refreshToken: creds.refreshToken, userId: creds.userId, orgId: creds.orgId});
            if (oauth) {
              tokenStore['forceOAuth'] = JSON.stringify(oauth);
            } else {
              console.log('oauth object is not present');
            }
            if (deferredLogin) deferredLogin.resolve();
          },
          function (error) {
            console.log(error);
            if (deferredLogin) deferredLogin.reject(error);
          }
        );
      }, false);
    }

    function loginWithBrowser() {
      console.log('loginURL: ' + loginURL);
      console.log('oauthCallbackURL: ' + oauthCallbackURL);

      var loginWindowURL = loginURL + '/services/oauth2/authorize?client_id=' + appId + '&redirect_uri=' +
        oauthCallbackURL + '&response_type=token';
      window.open(loginWindowURL, '_blank', 'location=no');
    }

    /**
     * Gets the user's ID (if logged in)
     * @returns {string} | undefined
     */
    function getUserId() {
      return (typeof(oauth) !== 'undefined') ? oauth.user_id : undefined;
    }

    /**
     * Gets the user's Org ID (if logged in)
     * @returns {string} | undefined
     */
    function getOrgId() {
      return (typeof(oauth) !== 'undefined') ? oauth.org_id : undefined;
    }

    function getSFAccountManager() {
      return cordova.require('com.salesforce.plugin.sfaccountmanager');
    }

    function getCurrentUser() {
      var deferred = $q.defer();
      if (useCordova) {
        var sfAccountManager = getSFAccountManager();
        sfAccountManager.getCurrentUser(function(result) {
          deferred.resolve(result);
        }, function(error) {
          deferred.reject(error);
        })
      } else {
        chatter({path: '/users/me'})
          .then(function(result) {
            deferred.resolve(result);
          }, function(error) {
            deferred.reject(error);
          });
      }
      return deferred.promise;
    }

    function getInstanceUrl() {
      return oauth.instance_url ? oauth.instance_url : ((useProxy && proxyURL) ? proxyURL.replace('my.salesforce', 'content.force') : '');
    }

    /**
     * Check the login status
     * @returns {boolean}
     */
    function isAuthenticated() {
      var deferred = $q.defer();
      if (useCordova) {
        oauthPlugin = cordova.require("com.salesforce.plugin.oauth");
        if (!oauthPlugin) {
          console.error('Salesforce Mobile SDK OAuth plugin not available');
        } else {
          oauthPlugin.authenticate(function(creds) {
            init({accessToken: creds.accessToken, instanceURL: creds.instanceUrl, refreshToken: creds.refreshToken, userId: creds.userId, orgId: creds.orgId});
            if (oauth) {
              tokenStore['forceOAuth'] = JSON.stringify(oauth);
            } else {
              console.log('oauth object is not present');
            }
            deferred.resolve();
          },
          function(error) {
            // Remove current session - try to login again
            oauthPlugin.logout();
            // Kill the page
            // deferred.reject(error);
          });
        }
      } else {
        (oauth && oauth.access_token) ? deferred.resolve() : deferred.reject();
      }
      return deferred.promise;
    }

    /**
     * @param path: full path or path relative to end point - required
     * @param endPoint: undefined or endpoint - optional
     * @return object with {endPoint:XX, path:relativePathToXX}
     *
     * For instance for undefined, '/services/data'     => {endPoint:'/services/data', path:'/'}
     *                  undefined, '/services/apex/abc' => {endPoint:'/services/apex', path:'/abc'}
     *                  '/services/data, '/versions'    => {endPoint:'/services/data', path:'/versions'}
     */
    function computeEndPointIfMissing(endPoint, path) {
        if (endPoint !== undefined) {
            return {endPoint:endPoint, path:path};
        }
        else {
            var parts = path.split('/').filter(function(s) { return s !== ""; });
            if (parts.length >= 2) {
                return {endPoint: '/' + parts.slice(0,2).join('/'), path: '/' + parts.slice(2).join('/')};
            }
            else {
                return {endPoint: '', path:path};
            }
        }
    }

    /**
     * Lets you make any Salesforce REST API request.
     * @param obj - Request configuration object. Can include:
     *  method:  HTTP method: GET, POST, etc. Optional - Default is 'GET'
     *  path:    path in to the Salesforce endpoint - Required
     *  params:  queryString parameters as a map - Optional
     *  data:  JSON object to send in the request body - Optional
     */

    function request(obj) {
      var d = new Date();
      var id = d.getTime() + Math.random().toString(36).substring(2,5);
      $rootScope.$broadcast('$requestStarted', {id: id});
      // NB: networkPlugin will be defined only if plugin was detected on init
      if (networkPlugin) {
          return requestWithPlugin(obj, id);
      } else {
          return requestWithBrowser(obj, id);
      }
    }

    var _refreshTokenInitialized = false;
    var _blockedRequests = [];

    function requestWithPlugin(obj, id) {
      var deferred = $q.defer();
      Object.assign(obj, computeEndPointIfMissing(obj.endPoint, obj.path));

      if (obj.params && obj.path.indexOf('?') === -1) {
        obj.path += '?' + $httpParamSerializer(obj.params);
      }

      networkPlugin.sendRequest(obj.endPoint, obj.path, function(result) {
        $rootScope.$broadcast('$requestCompleted', {id: id});
        if (result.notifications && result.notifications.length > 0) {
          for (var i = 0, j = result.notifications.length; i < j; i++) {
            if (result.notifications[i].level !== '' && result.notifications[i].message !== '') {
              $rootScope.$broadcast('$showNotification', {'level': result.notifications[i].level, 'message': result.notifications[i].message});
            }
          }
        }
        deferred.resolve(result);
      }, function(result) {
        // Token got revoked?
        if (result === 'Instance URL is null') {
          _blockedRequests.push({obj: obj, id: id, deferred: deferred});
          if (!_refreshTokenInitialized) {
            _refreshTokenInitialized = true;
            refreshTokenWithPlugin()
              .then(() => {
                _refreshTokenInitialized = false;
                _blockedRequests.forEach(function(request){
                  request.deferred.resolve(requestWithPlugin(request.obj, request.id));
                });
                _blockedRequests = [];
              });
          }
        } else {
          $rootScope.$broadcast('$requestCompleted', {id: id});
          deferred.reject(result);
        }
      }, obj.method, obj.data, obj.headerParams);
      return deferred.promise
    }

    function requestWithBrowser(obj, id) {
      var method = obj.method || 'GET',
        headers = {},
        url = getRequestBaseURL(),
        deferred = $q.defer(),
        responseType = obj.responseType;

      if (!oauth || (!oauth.access_token && !oauth.refresh_token)) {
        if (!retry) {
          retry = true;
          console.log("%c forceng: First try, might be missing access token or 'init' wasn't completed yet. Let's try again. ", 'background: #000; color: #bada55');
          $timeout(function(){
            deferred.resolve(requestWithBrowser(obj, id));
          });
          return deferred.promise;
        } else {
          deferred.reject('No access token. Login and try again.');
          $rootScope.$broadcast('$requestCompleted', {id: id});
          return deferred.promise;
        }
      }

      // dev friendly API: Add leading '/' if missing so url + path concat always works
      if (obj.path.charAt(0) !== '/') {
        obj.path = '/' + obj.path;
      }

      if (!obj.ignoreUrl) {
        url = url + obj.path;
      } else {
        url = obj.url;
      }

      headers["Authorization"] = "Bearer " + oauth.access_token;
      if (obj.contentType) {
        headers["Content-Type"] = obj.contentType;
      }
      if (useProxy) {
        headers["Target-URL"] = oauth.instance_url;
      }

      $http({
        headers: headers,
        method: method,
        url: url,
        params: obj.params,
        data: obj.data,
        responseType: responseType
      })
        .success(function (data, status, headers, config) {
          $rootScope.$broadcast('$requestCompleted', {id: id});
          deferred.resolve(data);
        })
        .error(function (data, status, headers, config) {
          $rootScope.$broadcast('$requestCompleted', {id: id});
          if (status === 401 && oauth.refresh_token) {
            refreshToken()
                .then(function () {
                    // Try again with the new token
                    deferred.resolve(request(obj));
                  }, function () {
                    // New token failed, let's try to log in
                    delete tokenStore['forceOAuth'];
                    login().then(function(){
                      deferred.resolve(request(obj));
                    }, function() {
                      // Everything failed, throw error
                      console.error(data);
                      deferred.reject(data);
                    });
                });
          } else if (status === -1) {
            // Probably VF Session got expired
            logout();
          } else {
            console.error(data);
            deferred.reject(data);
          }

        });

      return deferred.promise;
    }

    /**
     * Execute SOQL query
     * @param soql
     * @returns {*}
     */
    function query(soql) {

      return request({
        path: '/services/data/' + apiVersion + '/query',
        params: {q: soql}
      });

    }

    /**
     * Retrieve a record based on its Id
     * @param objectName
     * @param id
     * @param fields
     * @returns {*}
     */
    function retrieve(objectName, id, fields) {

      return request({
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id,
        params: fields ? {fields: fields} : undefined
      });

    }

    /**
     * Create a record
     * @param objectName
     * @param data
     * @returns {*}
     */
    function create(objectName, data) {

      return request({
        method: 'POST',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/',
        data: data
      });

    }

    /**
     * Update a record
     * @param objectName
     * @param data
     * @returns {*}
     */
    function update(objectName, data) {

      var id = data.Id,
        fields = angular.copy(data);

      delete fields.attributes;
      delete fields.Id;

      return request({
        method: 'POST',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id,
        params: {'_HttpMethod': 'PATCH'},
        data: fields
      });

    }

    /**
     * Delete a record
     * @param objectName
     * @param id
     * @returns {*}
     */
    function del(objectName, id) {

      return request({
        method: 'DELETE',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + id
      });

    }

    /**
     * Upsert a record
     * @param objectName
     * @param externalIdField
     * @param externalId
     * @param data
     * @returns {*}
     */
    function upsert(objectName, externalIdField, externalId, data) {

      return request({
        method: 'PATCH',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/sobjects/' + objectName + '/' + externalIdField + '/' + externalId,
        data: data
      });

    }

    /**
     * Convenience function to invoke APEX REST endpoints
     * @param pathOrParams
     * @param successHandler
     * @param errorHandler
     */
    function apexrest(pathOrParams) {

      var params;

      if (pathOrParams.substring) {
        params = {path: pathOrParams};
      } else {
        params = pathOrParams;

        if (params.path.charAt(0) !== "/") {
          params.path = "/" + params.path;
        }

        if (params.path.substr(0, 18) !== "/services/apexrest") {
          params.path = "/services/apexrest" + params.path;
        }
      }

      return request(params);
    }

    /**
     * Convenience function to invoke the Chatter API
     * @param params
     * @param successHandler
     * @param errorHandler
     */
    function chatter(params) {

      var base = "/services/data/" + apiVersion + "/chatter";

      if (!params || !params.path) {
        errorHandler("You must specify a path for the request");
        return;
      }

      if (params.path.charAt(0) !== "/") {
        params.path = "/" + params.path;
      }

      params.path = base + params.path;

      return request(params);

    }

    /**
    * Create a SObject Tree
    * @param data
    * @returns {*}
    */
    function createTree(data) {

      return request({
        method: 'POST',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/composite/tree',
        data: data
      });

    }

    /**
    * Create a Batch Requests
    * @param data
    * @returns {*}
    */
    function createBatchRequests(data) {

      return request({
        method: 'POST',
        contentType: 'application/json',
        path: '/services/data/' + apiVersion + '/composite/batch',
        data: {
          batchRequests: data
        }
      });

    }

    /**
    * Create single Batch Request body
    * @param {String} url
    * @param {String} method
    * @param {Object} data
    * @returns {Object}
    */
    function createBatchRequest(url, method, data) {
      if (url.charAt(0) !== "/") {
        url = "/" + url;
      }
      url = apiVersion + url
      return {
        url: url,
        method: method,
        richInput: data
      };
    };

    function createVFRequest(url) {
      return oauth.instance_url + '/secur/frontdoor.jsp?sid=' + oauth.access_token + '&retURL=' + url;
    }

    function getApiVersion() {
      return apiVersion;
    }

    function getToken() {
      return oauth.access_token;
    }

    // The public API
    return {
      init: init,
      login: login,
      logout: logout,
      getUserId: getUserId,
      getOrgId: getOrgId,
      getCurrentUser: getCurrentUser,
      getInstanceUrl: getInstanceUrl,
      getApiVersion: getApiVersion,
      getToken: getToken,
      isAuthenticated: isAuthenticated,
      request: request,
      requestWithBrowser: requestWithBrowser,
      query: query,
      create: create,
      createTree: createTree,
      createBatchRequests: createBatchRequests,
      createBatchRequest: createBatchRequest,
      createVFRequest: createVFRequest,
      update: update,
      del: del,
      upsert: upsert,
      retrieve: retrieve,
      apexrest: apexrest,
      chatter: chatter,
      discardToken: discardToken,
      oauthCallback: oauthCallback
    };

  });

// Global function called back by the OAuth login dialog
function oauthCallback(url) {
  var injector = angular.element(document.body).injector();
  injector.invoke(function (force) {
    force.oauthCallback(url);
  });
}
