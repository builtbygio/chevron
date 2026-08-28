'use strict';

const React = require('react');
const PropTypes = require('prop-types');
const {
  resolveClientId,
  requestDeviceCode,
  pollAccessToken
} = require('../github-app-auth');

class GithubLoginView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      mode: 'choose',
      token: '',
      userCode: '',
      verificationUri: 'https://github.com/login/device',
      error: null
    };
    this._abort = null;
    this.handleAppLogin = this.handleAppLogin.bind(this);
    this.handleShowPat = this.handleShowPat.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleSubmitToken = this.handleSubmitToken.bind(this);
    this.handleTokenChange = this.handleTokenChange.bind(this);
  }

  componentWillUnmount() {
    this.cancelDeviceFlow();
  }

  cancelDeviceFlow() {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
  }

  render() {
    return React.createElement(
      'div',
      {className: 'github-GithubLoginView'},
      this.renderSubview()
    );
  }

  renderSubview() {
    if (this.state.mode === 'device') {
      return this.renderDevice();
    }
    if (this.state.mode === 'pat') {
      return this.renderTokenInput();
    }
    return this.renderChoose();
  }

  renderChoose() {
    const clientId = resolveClientId();
    return React.createElement(
      'div',
      {className: 'github-GithubLoginView-Subview'},
      React.createElement('div', {className: 'github-GitHub-LargeIcon icon icon-mark-github'}),
      React.createElement('h1', null, 'Log in to GitHub'),
      this.props.children,
      this.state.error &&
        React.createElement('p', {className: 'error-messages'}, this.state.error),
      React.createElement(
        'button',
        {
          onClick: this.handleAppLogin,
          className: 'btn btn-primary icon icon-octoface',
          disabled: !clientId
        },
        'Login with GitHub'
      ),
      !clientId &&
        React.createElement(
          'p',
          null,
          'Set ',
          React.createElement('code', null, 'github.oauthClientId'),
          ' to the Chevron GitHub App client ID (device flow), or use a classic personal access token.'
        ),
      React.createElement(
        'p',
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'btn',
            onClick: this.handleShowPat
          },
          'Use a classic personal access token'
        )
      )
    );
  }

  renderDevice() {
    return React.createElement(
      'div',
      {className: 'github-GithubLoginView-Subview'},
      React.createElement('div', {className: 'github-GitHub-LargeIcon icon icon-mark-github'}),
      React.createElement('h1', null, 'Authorize Chevron'),
      React.createElement(
        'p',
        null,
        'Enter this code at ',
        React.createElement(
          'a',
          {href: this.state.verificationUri},
          this.state.verificationUri.replace(/^https:\/\//, '')
        ),
        ':'
      ),
      React.createElement(
        'p',
        {className: 'github-GithubLoginView-userCode'},
        this.state.userCode
      ),
      this.state.error &&
        React.createElement('p', {className: 'error-messages'}, this.state.error),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'btn icon icon-remove-close',
          onClick: this.handleCancel
        },
        'Cancel'
      )
    );
  }

  renderTokenInput() {
    return React.createElement(
      'form',
      {
        className: 'github-GithubLoginView-Subview',
        onSubmit: this.handleSubmitToken
      },
      React.createElement('div', {className: 'github-GitHub-LargeIcon icon icon-mark-github'}),
      React.createElement('h1', null, 'Enter Token'),
      React.createElement(
        'ol',
        null,
        React.createElement(
          'li',
          null,
          'Visit ',
          React.createElement(
            'a',
            {
              href: 'https://github.com/settings/tokens/new?scopes=repo,read:org,user:email&description=Chevron'
            },
            'github.com/settings/tokens'
          ),
          ' and create a ',
          React.createElement('strong', null, 'classic'),
          ' personal access token with ',
          React.createElement('code', null, 'repo'),
          ', ',
          React.createElement('code', null, 'read:org'),
          ', and ',
          React.createElement('code', null, 'user:email'),
          '. Fine-grained tokens will not work.'
        ),
        React.createElement('li', null, 'Enter the token below:')
      ),
      React.createElement('input', {
        type: 'text',
        className: 'input-text native-key-bindings',
        placeholder: 'Enter your token...',
        value: this.state.token,
        onChange: this.handleTokenChange
      }),
      React.createElement(
        'ul',
        null,
        React.createElement(
          'li',
          null,
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: this.handleCancel,
              className: 'btn icon icon-remove-close'
            },
            'Cancel'
          )
        ),
        React.createElement(
          'li',
          null,
          React.createElement(
            'button',
            {
              type: 'submit',
              className: 'btn btn-primary icon icon-check'
            },
            'Login'
          )
        )
      )
    );
  }

  async handleAppLogin() {
    const clientId = resolveClientId();
    if (!clientId) {
      this.setState({
        error: 'Set github.oauthClientId to the Chevron GitHub App client ID.'
      });
      return;
    }
    this.cancelDeviceFlow();
    const abort = new AbortController();
    this._abort = abort;
    try {
      const started = await requestDeviceCode(clientId);
      this.setState({
        mode: 'device',
        userCode: started.user_code,
        verificationUri: started.verification_uri || 'https://github.com/login/device',
        error: null
      });
      try {
        if (chevron && chevron.applicationDelegate && chevron.applicationDelegate.openExternal) {
          await chevron.applicationDelegate.openExternal(started.verification_uri);
        }
      } catch (_e) {
        /* user can click the link */
      }
      const session = await pollAccessToken({
        clientId,
        deviceCode: started.device_code,
        interval: started.interval,
        signal: abort.signal
      });
      if (this._abort !== abort) return;
      this.props.onLogin({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in
      });
    } catch (err) {
      if (err.code === 'cancelled') return;
      this.setState({
        mode: 'choose',
        error: err.message || String(err)
      });
    }
  }

  handleShowPat() {
    this.cancelDeviceFlow();
    this.setState({mode: 'pat', error: null});
  }

  handleCancel(e) {
    if (e && e.preventDefault) e.preventDefault();
    this.cancelDeviceFlow();
    this.setState({mode: 'choose', error: null, token: ''});
  }

  handleSubmitToken(e) {
    if (e && e.preventDefault) e.preventDefault();
    this.props.onLogin(this.state.token);
  }

  handleTokenChange(e) {
    this.setState({token: e.target.value});
  }
}

GithubLoginView.propTypes = {
  children: PropTypes.node,
  onLogin: PropTypes.func
};

GithubLoginView.defaultProps = {
  children: React.createElement(
    'div',
    {className: 'initialize-repo-description'},
    React.createElement(
      'span',
      null,
      'Log in to GitHub to access PR information and more!'
    )
  ),
  onLogin: () => {}
};

module.exports = GithubLoginView;
